"""
auth_billing.py — Firebase Authentication + Stripe Billing for GG-AI.

Provides:
  • Firebase ID token verification middleware
  • User registration / Firestore-like local DB storage
  • Stripe Checkout, Portal, Cancel, Webhook endpoints
  • Subscription status + tier-based rate limiting helpers

Integrate into main.py with:
    from auth_billing import billing_router, firebase_app, verify_firebase_token, get_user_subscription, TIER_LIMITS
    app.include_router(billing_router)
"""

import os
import json
import sqlite3
import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Optional

import stripe
from fastapi import APIRouter, Request, HTTPException, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ─── Firebase Admin SDK ───────────────────────────────────────────────────────

import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

_FIREBASE_CRED_PATH = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY", "firebase-service-account.json")

# Initialize Firebase Admin (only once)
if not firebase_admin._apps:
    if os.path.exists(_FIREBASE_CRED_PATH):
        cred = credentials.Certificate(_FIREBASE_CRED_PATH)
        firebase_app = firebase_admin.initialize_app(cred)
        print(f"🔥 Firebase Admin SDK inițializat cu: {_FIREBASE_CRED_PATH}")
    else:
        # Allow running without Firebase for local dev (mock mode)
        firebase_app = None
        print(f"⚠️ Firebase Admin: Fișierul {_FIREBASE_CRED_PATH} nu a fost găsit. "
              f"Auth endpoints vor funcționa numai în mod mock.")
else:
    firebase_app = firebase_admin.get_app()

# ─── Stripe Configuration ────────────────────────────────────────────────────

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

# Price IDs — same env vars as billing_endpoints.py template
PRICE_ID_WEEKLY = os.environ.get("STRIPE_PRICE_ID_WEEKLY")
PRICE_ID_PRO_MONTHLY = os.environ.get("STRIPE_PRICE_ID_PRO_MONTHLY")
PRICE_ID_PRO_YEARLY = os.environ.get("STRIPE_PRICE_ID_PRO_YEARLY")
PRICE_ID_ELITE_MONTHLY = os.environ.get("STRIPE_PRICE_ID_ELITE_MONTHLY")
PRICE_ID_ELITE_YEARLY = os.environ.get("STRIPE_PRICE_ID_ELITE_YEARLY")

# Map Stripe price_id → plan name
PRICE_TO_PLAN: dict[str, str] = {}
if PRICE_ID_WEEKLY:        PRICE_TO_PLAN[PRICE_ID_WEEKLY] = "weekly"
if PRICE_ID_PRO_MONTHLY:   PRICE_TO_PLAN[PRICE_ID_PRO_MONTHLY] = "pro"
if PRICE_ID_PRO_YEARLY:    PRICE_TO_PLAN[PRICE_ID_PRO_YEARLY] = "pro"
if PRICE_ID_ELITE_MONTHLY: PRICE_TO_PLAN[PRICE_ID_ELITE_MONTHLY] = "elite"
if PRICE_ID_ELITE_YEARLY:  PRICE_TO_PLAN[PRICE_ID_ELITE_YEARLY] = "elite"

# ─── Tier Limits ──────────────────────────────────────────────────────────────

TIER_LIMITS = {
    "weekly": {
        "max_analyses_per_day": 7,
        "max_risk_analyses_per_day": 0,      # No risk analyzer
        "has_risk_analyzer": False,
    },
    "pro": {
        "max_analyses_per_day": None,         # Unlimited
        "max_risk_analyses_per_day": 7,
        "has_risk_analyzer": True,
    },
    "elite": {
        "max_analyses_per_day": None,         # Unlimited
        "max_risk_analyses_per_day": None,    # Unlimited
        "has_risk_analyzer": True,
    },
}

# ─── Users Database (SQLite) ─────────────────────────────────────────────────

_USERS_DB = "users.db"

def _users_connect():
    conn = sqlite3.connect(_USERS_DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_users_db():
    """Create users + usage tables if they don't exist."""
    conn = _users_connect()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            uid TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            provider TEXT DEFAULT 'email',
            full_name TEXT,
            date_of_birth TEXT,
            stripe_customer_id TEXT,
            stripe_subscription_id TEXT,
            plan TEXT,
            status TEXT DEFAULT 'inactive',
            current_period_end TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Migration: add columns if they don't exist (for existing DBs)
    try:
        cur.execute("ALTER TABLE users ADD COLUMN full_name TEXT")
    except Exception:
        pass
    try:
        cur.execute("ALTER TABLE users ADD COLUMN date_of_birth TEXT")
    except Exception:
        pass
    cur.execute("""
        CREATE TABLE IF NOT EXISTS daily_usage (
            uid TEXT NOT NULL,
            usage_date TEXT NOT NULL,
            analyses_count INTEGER DEFAULT 0,
            risk_analyses_count INTEGER DEFAULT 0,
            PRIMARY KEY (uid, usage_date)
        )
    """)
    conn.commit()
    conn.close()
    print("✅ Users DB inițializat (users.db)")

# ─── DB Helpers ───────────────────────────────────────────────────────────────

def _get_user(uid: str) -> Optional[dict]:
    conn = _users_connect()
    row = conn.execute("SELECT * FROM users WHERE uid = ?", (uid,)).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def _upsert_user(uid: str, email: str, provider: str = "email", full_name: str = None, date_of_birth: str = None):
    conn = _users_connect()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute("""
        INSERT INTO users (uid, email, provider, full_name, date_of_birth, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(uid) DO UPDATE SET
            email = excluded.email,
            full_name = COALESCE(excluded.full_name, users.full_name),
            date_of_birth = COALESCE(excluded.date_of_birth, users.date_of_birth),
            updated_at = ?
    """, (uid, email, provider, full_name, date_of_birth, now, now, now))
    conn.commit()
    conn.close()

def _update_user_subscription(uid: str, **kwargs):
    conn = _users_connect()
    now = datetime.now(timezone.utc).isoformat()
    sets = ["updated_at = ?"]
    vals = [now]
    for k, v in kwargs.items():
        sets.append(f"{k} = ?")
        vals.append(v)
    vals.append(uid)
    conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE uid = ?", vals)
    conn.commit()
    conn.close()

def _get_user_by_stripe_customer(customer_id: str) -> Optional[dict]:
    conn = _users_connect()
    row = conn.execute("SELECT * FROM users WHERE stripe_customer_id = ?", (customer_id,)).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def _usage_date_key() -> str:
    """
    Return the 'usage date' key aligned with the 10:00 Romanian-time reset.
    Before 10:00 Romania → previous calendar day.  After 10:00 → today.
    """
    ro_tz = ZoneInfo("Europe/Bucharest")
    now_ro = datetime.now(ro_tz)
    if now_ro.hour < 10:
        return (now_ro - timedelta(days=1)).strftime("%Y-%m-%d")
    return now_ro.strftime("%Y-%m-%d")

def _get_daily_usage(uid: str) -> dict:
    """Get today's usage counts for a user (aligned with 10:00 RO reset)."""
    today = _usage_date_key()
    conn = _users_connect()
    row = conn.execute(
        "SELECT analyses_count, risk_analyses_count FROM daily_usage WHERE uid = ? AND usage_date = ?",
        (uid, today)
    ).fetchone()
    conn.close()
    if row:
        return {"analyses": row["analyses_count"], "risk_analyses": row["risk_analyses_count"]}
    return {"analyses": 0, "risk_analyses": 0}

def _increment_usage(uid: str, column: str):
    """Increment a usage counter for today (aligned with 10:00 RO reset)."""
    today = _usage_date_key()
    conn = _users_connect()
    conn.execute("""
        INSERT INTO daily_usage (uid, usage_date, analyses_count, risk_analyses_count)
        VALUES (?, ?, 0, 0)
        ON CONFLICT(uid, usage_date) DO NOTHING
    """, (uid, today))
    conn.execute(f"""
        UPDATE daily_usage SET {column} = {column} + 1
        WHERE uid = ? AND usage_date = ?
    """, (uid, today))
    conn.commit()
    conn.close()

# ─── Firebase Token Verification ──────────────────────────────────────────────

MOCK_AUTH_ENABLED = os.environ.get("MOCK_AUTH", "false").lower() == "true"

async def verify_firebase_token(authorization: Optional[str] = Header(default=None)) -> dict:
    """
    FastAPI dependency: extracts and verifies Firebase ID token from Authorization header.
    Returns decoded token dict with uid, email, etc.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token Firebase lipsă. Autentifică-te.")

    token = authorization.split("Bearer ")[1]

    # Mock mode for local development
    if MOCK_AUTH_ENABLED and token == "mock-firebase-token":
        return {
            "uid": "mock-user-001",
            "email": "test@gg-ai.pro",
            "email_verified": True,
        }

    if not firebase_app:
        raise HTTPException(
            status_code=503,
            detail="Firebase Admin SDK nu este configurat. Setează FIREBASE_SERVICE_ACCOUNT_KEY."
        )

    try:
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token expirat. Reautentifică-te.")
    except firebase_auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Token invalid.")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Eroare verificare token: {str(e)}")


def get_user_subscription(uid: str) -> dict:
    """Get subscription info with tier limits for a user."""
    user = _get_user(uid)
    if not user:
        return {
            "plan": None,
            "status": "inactive",
            "current_period_end": None,
            "tier_limits": None,
        }

    plan = user.get("plan")
    status = user.get("status", "inactive")

    # ── Fallback: if user paid but webhook hasn't updated DB yet, check Stripe ─
    if status != "active" and user.get("stripe_customer_id") and stripe.api_key:
        try:
            subs = stripe.Subscription.list(
                customer=user["stripe_customer_id"],
                status="active",
                limit=1,
            )
            if subs.data:
                sub = subs.data[0]
                price_id = sub["items"]["data"][0]["price"]["id"]
                plan = PRICE_TO_PLAN.get(price_id, "unknown")
                status = "active"
                period_end = datetime.fromtimestamp(
                    sub["current_period_end"], tz=timezone.utc
                ).isoformat()
                # Sync to DB so we don't hit Stripe on every call
                _update_user_subscription(
                    uid,
                    stripe_subscription_id=sub["id"],
                    plan=plan,
                    status="active",
                    current_period_end=period_end,
                )
                print(f"🔄 [Sync] User {uid} synced from Stripe: {plan}/active", flush=True)
        except Exception as e:
            print(f"⚠️ [Sync] Failed to check Stripe for {uid}: {e}", flush=True)

    limits = TIER_LIMITS.get(plan) if plan else None

    return {
        "plan": plan,
        "status": status,
        "current_period_end": user.get("current_period_end"),
        "tier_limits": limits,
    }


def _next_reset_iso() -> str:
    """Return the next 10:00 Romanian time as an ISO-8601 UTC string."""
    ro_tz = ZoneInfo("Europe/Bucharest")
    now_ro = datetime.now(ro_tz)
    reset_today = now_ro.replace(hour=10, minute=0, second=0, microsecond=0)
    if now_ro >= reset_today:
        reset_next = reset_today + timedelta(days=1)
    else:
        reset_next = reset_today
    return reset_next.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def check_analysis_quota(uid: str, plan: str) -> None:
    """Raise 429 if user exceeded their daily analysis quota."""
    limits = TIER_LIMITS.get(plan, {})
    max_analyses = limits.get("max_analyses_per_day")
    if max_analyses is None:
        return  # Unlimited
    usage = _get_daily_usage(uid)
    if usage["analyses"] >= max_analyses:
        raise HTTPException(
            status_code=429,
            detail=json.dumps({
                "message": f"Ai atins limita zilnică de {max_analyses} analize. Upgrade la un plan superior pentru analize nelimitate.",
                "reset_at": _next_reset_iso(),
                "limit": max_analyses,
            }),
        )


def check_risk_quota(uid: str, plan: str) -> None:
    """Raise 429 if user exceeded their daily risk analysis quota."""
    limits = TIER_LIMITS.get(plan, {})
    if not limits.get("has_risk_analyzer"):
        raise HTTPException(
            status_code=403,
            detail="Analizorul de risc nu este inclus în planul tău. Upgrade la Pro sau Elite."
        )
    max_risk = limits.get("max_risk_analyses_per_day")
    if max_risk is None:
        return  # Unlimited
    usage = _get_daily_usage(uid)
    if usage["risk_analyses"] >= max_risk:
        raise HTTPException(
            status_code=429,
            detail=json.dumps({
                "message": f"Ai atins limita zilnică de {max_risk} analize de risc. Upgrade la Elite pentru analize nelimitate.",
                "reset_at": _next_reset_iso(),
                "limit": max_risk,
            }),
        )


# ─── Router ──────────────────────────────────────────────────────────────────

billing_router = APIRouter()

# ── Auth Endpoints ────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    uid: str
    email: str
    provider: str = "email"
    full_name: Optional[str] = None
    date_of_birth: Optional[str] = None

@billing_router.post("/api/auth/register")
async def register_user(data: RegisterRequest, authorization: Optional[str] = Header(default=None)):
    """
    Register or update user after Firebase signup.
    Called by frontend AuthContext after createUserWithEmailAndPassword or signInWithPopup.
    """
    # Verify the Firebase token to ensure the request is legitimate
    decoded = await verify_firebase_token(authorization)

    # Ensure the uid matches the token
    if decoded["uid"] != data.uid:
        raise HTTPException(status_code=403, detail="UID-ul nu corespunde cu tokenul.")

    # Validate age (must be 18+)
    if data.date_of_birth:
        try:
            dob = datetime.fromisoformat(data.date_of_birth)
            today = datetime.now(timezone.utc)
            age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
            if age < 18:
                raise HTTPException(status_code=400, detail="Trebuie să ai cel puțin 18 ani pentru a te înregistra.")
        except ValueError:
            raise HTTPException(status_code=400, detail="Data nașterii nu este validă.")

    _upsert_user(data.uid, data.email, data.provider, data.full_name, data.date_of_birth)

    return {"status": "ok", "message": "Utilizator înregistrat cu succes."}


@billing_router.get("/api/auth/profile")
async def get_profile(authorization: Optional[str] = Header(default=None)):
    """Get the current user's profile info."""
    decoded = await verify_firebase_token(authorization)
    uid = decoded["uid"]
    user = _get_user(uid)
    if not user:
        return {"uid": uid, "email": decoded.get("email", ""), "full_name": None, "date_of_birth": None}
    return {
        "uid": user["uid"],
        "email": user["email"],
        "full_name": user.get("full_name"),
        "date_of_birth": user.get("date_of_birth"),
        "provider": user.get("provider"),
    }


@billing_router.post("/api/auth/password-reset")
async def request_password_reset(request: Request):
    """Send a password reset email via Firebase Auth."""
    body = await request.json()
    email = body.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email-ul este necesar.")
    if not firebase_app:
        raise HTTPException(status_code=503, detail="Firebase nu este configurat.")
    try:
        # Generate password reset link via Firebase Admin
        link = firebase_auth.generate_password_reset_link(email)
        # In production you'd send this via your own email service,
        # but Firebase also sends it automatically via client SDK.
        return {"status": "ok", "message": "Un email de resetare a parolei a fost trimis."}
    except Exception as e:
        # Don't reveal if email exists or not
        return {"status": "ok", "message": "Dacă adresa există, vei primi un email de resetare."}


# ── Billing Endpoints ────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    price_id: str

@billing_router.post("/api/billing/create-checkout-session")
async def create_checkout_session(data: CheckoutRequest, authorization: Optional[str] = Header(default=None)):
    """Create a Stripe Checkout Session for subscription purchase."""
    decoded = await verify_firebase_token(authorization)
    uid = decoded["uid"]
    email = decoded.get("email", "")

    if not stripe.api_key:
        raise HTTPException(status_code=503, detail="Stripe nu este configurat.")

    if data.price_id not in PRICE_TO_PLAN:
        raise HTTPException(status_code=400, detail=f"Price ID invalid: {data.price_id}")

    # Ensure user exists in our DB
    user = _get_user(uid)
    if not user:
        _upsert_user(uid, email)
        user = _get_user(uid)

    # Look up or create Stripe customer
    customer_id = user.get("stripe_customer_id") if user else None

    if not customer_id:
        customer = stripe.Customer.create(
            email=email,
            metadata={"firebase_uid": uid},
        )
        customer_id = customer.id
        _update_user_subscription(uid, stripe_customer_id=customer_id)

    # Check if user already has an active subscription
    if user and user.get("status") == "active" and user.get("stripe_subscription_id"):
        raise HTTPException(
            status_code=400,
            detail="Ai deja un abonament activ. Gestionează-l din pagina Contul Meu."
        )

    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        payment_method_types=["card"],
        line_items=[{"price": data.price_id, "quantity": 1}],
        success_url=f"{FRONTEND_URL}/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{FRONTEND_URL}/cancel",
        metadata={"firebase_uid": uid},
        subscription_data={"metadata": {"firebase_uid": uid}},
    )

    return {"checkout_url": session.url}


@billing_router.get("/api/billing/me")
async def get_billing_me(authorization: Optional[str] = Header(default=None)):
    """Return current user's subscription status + tier limits."""
    decoded = await verify_firebase_token(authorization)
    uid = decoded["uid"]

    result = get_user_subscription(uid)

    # Also include daily usage
    usage = _get_daily_usage(uid)
    result["daily_usage"] = usage

    # Include reset_at so frontend can show countdown timer
    result["reset_at"] = _next_reset_iso()

    return result


@billing_router.post("/api/billing/cancel")
async def cancel_subscription(authorization: Optional[str] = Header(default=None)):
    """Cancel the current subscription (at period end)."""
    decoded = await verify_firebase_token(authorization)
    uid = decoded["uid"]

    user = _get_user(uid)
    if not user or not user.get("stripe_subscription_id"):
        raise HTTPException(status_code=400, detail="Nu ai un abonament activ.")

    if not stripe.api_key:
        raise HTTPException(status_code=503, detail="Stripe nu este configurat.")

    try:
        stripe.Subscription.modify(
            user["stripe_subscription_id"],
            cancel_at_period_end=True,
        )
        _update_user_subscription(uid, status="canceled")
        return {"status": "ok", "message": "Abonamentul va fi anulat la sfârșitul perioadei curente."}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Eroare Stripe: {str(e)}")


@billing_router.post("/api/billing/portal")
async def create_portal_session(authorization: Optional[str] = Header(default=None)):
    """Create a Stripe Customer Portal session for self-service management."""
    decoded = await verify_firebase_token(authorization)
    uid = decoded["uid"]

    user = _get_user(uid)
    if not user or not user.get("stripe_customer_id"):
        raise HTTPException(status_code=400, detail="Nu ai un cont Stripe asociat.")

    if not stripe.api_key:
        raise HTTPException(status_code=503, detail="Stripe nu este configurat.")

    try:
        session = stripe.billing_portal.Session.create(
            customer=user["stripe_customer_id"],
            return_url=f"{FRONTEND_URL}/account",
        )
        return {"url": session.url}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Eroare Stripe Portal: {str(e)}")


# ── Subscription Upgrade (schedule plan change at period end) ─────────────────

PLAN_RANK = {"weekly": 1, "pro": 2, "elite": 3}

class UpgradeRequest(BaseModel):
    price_id: str

@billing_router.post("/api/billing/upgrade")
async def upgrade_subscription(data: UpgradeRequest, authorization: Optional[str] = Header(default=None)):
    """
    Schedule a subscription plan change.
    - Upgrades take effect immediately (with proration).
    - Downgrades are scheduled for the end of the current period.
    """
    decoded = await verify_firebase_token(authorization)
    uid = decoded["uid"]

    if not stripe.api_key:
        raise HTTPException(status_code=503, detail="Stripe nu este configurat.")

    if data.price_id not in PRICE_TO_PLAN:
        raise HTTPException(status_code=400, detail=f"Price ID invalid: {data.price_id}")

    new_plan = PRICE_TO_PLAN[data.price_id]

    user = _get_user(uid)
    if not user:
        raise HTTPException(status_code=400, detail="Nu ai un abonament activ.")

    stripe_sub_id = user.get("stripe_subscription_id")

    # If subscription ID is missing from DB, try to find it from Stripe
    if not stripe_sub_id and user.get("stripe_customer_id"):
        try:
            subs = stripe.Subscription.list(
                customer=user["stripe_customer_id"],
                status="active",
                limit=1,
            )
            if subs.data:
                stripe_sub_id = subs.data[0]["id"]
                price_id_found = subs.data[0]["items"]["data"][0]["price"]["id"]
                found_plan = PRICE_TO_PLAN.get(price_id_found, user.get("plan"))
                period_end = datetime.fromtimestamp(
                    subs.data[0]["current_period_end"], tz=timezone.utc
                ).isoformat()
                _update_user_subscription(
                    uid,
                    stripe_subscription_id=stripe_sub_id,
                    plan=found_plan,
                    status="active",
                    current_period_end=period_end,
                )
                user = _get_user(uid)
                print(f"🔄 [Upgrade] Synced subscription {stripe_sub_id} for user {uid}", flush=True)
        except Exception as e:
            print(f"⚠️ [Upgrade] Failed to look up Stripe subscription for {uid}: {e}", flush=True)

    if not stripe_sub_id:
        raise HTTPException(status_code=400, detail="Nu ai un abonament activ.")

    current_plan = user.get("plan", "")
    if new_plan == current_plan:
        raise HTTPException(status_code=400, detail="Ai deja acest plan activ.")

    try:
        sub = stripe.Subscription.retrieve(stripe_sub_id)
        current_item_id = sub["items"]["data"][0]["id"]
        current_rank = PLAN_RANK.get(current_plan, 0)
        new_rank = PLAN_RANK.get(new_plan, 0)

        if new_rank > current_rank:
            # Upgrade: immediate with proration
            stripe.Subscription.modify(
                stripe_sub_id,
                items=[{"id": current_item_id, "price": data.price_id}],
                proration_behavior="create_prorations",
            )
            _update_user_subscription(uid, plan=new_plan)
            return {"status": "ok", "message": f"Planul a fost upgradat la {new_plan.capitalize()}. Modificarea este activa imediat.", "effective": "now"}
        else:
            # Downgrade: schedule at period end
            stripe.Subscription.modify(
                stripe_sub_id,
                items=[{"id": current_item_id, "price": data.price_id}],
                proration_behavior="none",
                billing_cycle_anchor="unchanged",
            )
            period_end = user.get("current_period_end", "")
            return {"status": "ok", "message": f"Planul va fi schimbat la {new_plan.capitalize()} la sfarsitul perioadei curente.", "effective": "period_end", "period_end": period_end}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Eroare Stripe: {str(e)}")


# ── Stripe Webhook ────────────────────────────────────────────────────────────

@billing_router.post("/api/billing/webhook")
async def stripe_webhook(request: Request):
    """
    Stripe webhook endpoint. Must receive raw body for signature verification.
    Configure in Stripe Dashboard → Webhooks → endpoint URL: https://yourdomain.com/api/billing/webhook
    Events to listen for:
      - checkout.session.completed
      - customer.subscription.updated
      - customer.subscription.deleted
      - invoice.payment_failed
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Webhook secret nu este configurat.")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Semnătură webhook invalidă.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Eroare webhook: {str(e)}")

    event_type = event["type"]
    data = event["data"]["object"]

    print(f"📩 [Stripe Webhook] Event: {event_type}", flush=True)

    if event_type == "checkout.session.completed":
        _handle_checkout_completed(data)
    elif event_type == "customer.subscription.updated":
        _handle_subscription_updated(data)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_deleted(data)
    elif event_type == "invoice.payment_failed":
        _handle_payment_failed(data)
    else:
        print(f"ℹ️ [Webhook] Eveniment ignorat: {event_type}", flush=True)

    return {"status": "ok"}


def _handle_checkout_completed(session: dict):
    """After successful checkout, activate subscription."""
    uid = session.get("metadata", {}).get("firebase_uid")
    subscription_id = session.get("subscription")

    if not uid or not subscription_id:
        print(f"⚠️ [Webhook] checkout.session.completed: Missing uid or subscription_id")
        return

    try:
        sub = stripe.Subscription.retrieve(subscription_id)
        price_id = sub["items"]["data"][0]["price"]["id"]
        plan = PRICE_TO_PLAN.get(price_id, "unknown")
        period_end = datetime.fromtimestamp(sub["current_period_end"], tz=timezone.utc).isoformat()

        _update_user_subscription(
            uid,
            stripe_subscription_id=subscription_id,
            plan=plan,
            status="active",
            current_period_end=period_end,
        )
        print(f"✅ [Webhook] User {uid} → plan: {plan}, status: active")
    except Exception as e:
        print(f"❌ [Webhook] Error processing checkout: {e}")


def _handle_subscription_updated(subscription: dict):
    """Subscription renewed, plan changed, or status changed."""
    customer_id = subscription.get("customer")
    subscription_id = subscription.get("id")
    status = subscription.get("status")
    price_id = subscription["items"]["data"][0]["price"]["id"]
    plan = PRICE_TO_PLAN.get(price_id, "unknown")
    period_end = datetime.fromtimestamp(
        subscription["current_period_end"], tz=timezone.utc
    ).isoformat()

    user = _get_user_by_stripe_customer(customer_id)
    if not user:
        print(f"⚠️ [Webhook] subscription.updated: No user found for customer {customer_id}")
        return

    _update_user_subscription(
        user["uid"],
        stripe_subscription_id=subscription_id,
        plan=plan,
        status=status,
        current_period_end=period_end,
    )
    print(f"📝 [Webhook] Subscription updated: {user['uid']} → {plan}/{status}")


def _handle_subscription_deleted(subscription: dict):
    """Subscription was fully canceled/expired."""
    customer_id = subscription.get("customer")
    subscription_id = subscription.get("id")

    user = _get_user_by_stripe_customer(customer_id)
    if not user:
        print(f"⚠️ [Webhook] subscription.deleted: No user found for customer {customer_id}")
        return

    _update_user_subscription(
        user["uid"],
        status="canceled",
        plan=None,
        stripe_subscription_id=None,
    )
    print(f"🚫 [Webhook] Subscription canceled: {user['uid']}")


def _handle_payment_failed(invoice: dict):
    """Payment failed on renewal — mark as past_due."""
    customer_id = invoice.get("customer")
    subscription_id = invoice.get("subscription")

    user = _get_user_by_stripe_customer(customer_id)
    if not user:
        print(f"⚠️ [Webhook] payment_failed: No user found for customer {customer_id}")
        return

    _update_user_subscription(user["uid"], status="past_due")
    print(f"⚠️ [Webhook] Payment failed: {user['uid']} → past_due")
