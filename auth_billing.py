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
import secrets
import hashlib
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Optional

import stripe
from fastapi import APIRouter, Request, HTTPException, Header, Depends, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ─── Firebase Admin SDK ───────────────────────────────────────────────────────

import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

# Initialize Firebase Admin (only once)
if not firebase_admin._apps:
    # Try to load from JSON string in environment variable (for Railway/cloud deployment)
    firebase_json_str = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    
    if firebase_json_str:
        try:
            firebase_creds_dict = json.loads(firebase_json_str)
            cred = credentials.Certificate(firebase_creds_dict)
            firebase_app = firebase_admin.initialize_app(cred)
            print("🔥 Firebase Admin SDK inițializat din variabilă de mediu (JSON)")
        except json.JSONDecodeError as e:
            firebase_app = None
            print(f"⚠️ Firebase Admin: Eroare la parsarea JSON-ului: {e}")
    else:
        # Fall back to file path (for local development)
        _FIREBASE_CRED_PATH = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY", "firebase-service-account.json")
        
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
            cancel_at_period_end INTEGER DEFAULT 0,
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
    try:
        cur.execute("ALTER TABLE users ADD COLUMN cancel_at_period_end INTEGER DEFAULT 0")
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
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_match_views (
            uid TEXT NOT NULL,
            match_key TEXT NOT NULL,
            usage_date TEXT NOT NULL,
            PRIMARY KEY (uid, match_key, usage_date)
        )
    """)
    # ── Tabel remember_tokens pentru "Ține-mă minte" ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS remember_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            user_agent TEXT,
            ip TEXT,
            FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_remember_tokens_uid ON remember_tokens(uid)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_remember_tokens_hash ON remember_tokens(token_hash)")
    conn.commit()
    conn.close()
    print("✅ Users DB inițializat (users.db)")

# ─── DB Helpers ───────────────────────────────────────────────────────────────

def _sg(obj, key, default=None):
    """Safely get a field from a Stripe object or dict.
    Works with both old and new Stripe API versions."""
    try:
        return obj[key]
    except (KeyError, TypeError, IndexError):
        return default


def _stripe_period_end(sub) -> int | None:
    """Extract current_period_end timestamp from a Stripe subscription.
    Newer Stripe API versions moved this field to the subscription item."""
    # Try subscription-level first (old API)
    val = _sg(sub, "current_period_end")
    if val is not None:
        return val
    # Try item-level (new API 2025+)
    try:
        item = sub["items"]["data"][0]
        return _sg(item, "current_period_end")
    except (KeyError, TypeError, IndexError):
        pass
    # Try billing_cycle_anchor as last resort
    return _sg(sub, "billing_cycle_anchor")


def _get_user(uid: str) -> Optional[dict]:
    conn = _users_connect()
    row = conn.execute("SELECT * FROM users WHERE uid = ?", (uid,)).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def _save_profile_to_firebase(uid: str, full_name: str = None, date_of_birth: str = None):
    """Persist profile fields in Firebase Auth so they survive SQLite DB resets."""
    if not firebase_app:
        return
    try:
        update_kwargs = {}
        if full_name:
            update_kwargs["display_name"] = full_name
        if update_kwargs:
            firebase_auth.update_user(uid, **update_kwargs)
        # Store date_of_birth in custom claims (survives redeploys)
        if date_of_birth:
            existing = firebase_auth.get_user(uid).custom_claims or {}
            firebase_auth.set_custom_user_claims(uid, {**existing, "date_of_birth": date_of_birth})
    except Exception as e:
        logging.warning(f"Could not persist profile to Firebase: {e}")

def _get_profile_from_firebase(uid: str) -> dict:
    """Read profile fields from Firebase Auth (displayName + custom claims)."""
    if not firebase_app:
        return {}
    try:
        fb_user = firebase_auth.get_user(uid)
        claims = fb_user.custom_claims or {}
        return {
            "full_name": fb_user.display_name or claims.get("full_name"),
            "date_of_birth": claims.get("date_of_birth"),
        }
    except Exception:
        return {}

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


def _increment_unique_analysis(uid: str, match_key: str) -> bool:
    """
    Increment analysis counter only if this user hasn't viewed this match today.
    Returns True if counter was incremented (first view), False if already seen.
    """
    today = _usage_date_key()
    conn = _users_connect()
    # Try to insert — if already exists, it's a duplicate view
    cur = conn.execute(
        "INSERT OR IGNORE INTO user_match_views (uid, match_key, usage_date) VALUES (?, ?, ?)",
        (uid, match_key, today)
    )
    if cur.rowcount == 0:
        conn.close()
        return False  # Already viewed today
    # First view — increment counter
    conn.execute("""
        INSERT INTO daily_usage (uid, usage_date, analyses_count, risk_analyses_count)
        VALUES (?, ?, 0, 0)
        ON CONFLICT(uid, usage_date) DO NOTHING
    """, (uid, today))
    conn.execute("""
        UPDATE daily_usage SET analyses_count = analyses_count + 1
        WHERE uid = ? AND usage_date = ?
    """, (uid, today))
    conn.commit()
    conn.close()
    return True


def _already_viewed_today(uid: str, match_key: str) -> bool:
    """Check if user already viewed this match today (no counter impact)."""
    today = _usage_date_key()
    conn = _users_connect()
    row = conn.execute(
        "SELECT 1 FROM user_match_views WHERE uid = ? AND match_key = ? AND usage_date = ?",
        (uid, match_key, today)
    ).fetchone()
    conn.close()
    return row is not None

# ─── Remember Token Helpers ───────────────────────────────────────────────────

REMEMBER_TOKEN_DAYS = 30  # Durata de viață a token-ului "Ține-mă minte"

def _hash_token(token: str) -> str:
    """Hash SHA-256 al token-ului — în DB stocăm doar hash-ul."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def _create_remember_token(uid: str, user_agent: str = None, ip: str = None) -> str:
    """
    Generează un token securizat, stochează hash-ul în DB și returnează token-ul brut.
    Token-ul brut va fi trimis clientului într-un cookie HttpOnly.
    """
    raw_token = secrets.token_urlsafe(64)  # 64 bytes → ~86 caractere URL-safe
    token_hash = _hash_token(raw_token)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=REMEMBER_TOKEN_DAYS)).isoformat()
    now = datetime.now(timezone.utc).isoformat()

    conn = _users_connect()
    conn.execute(
        """INSERT INTO remember_tokens (uid, token_hash, expires_at, created_at, user_agent, ip)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (uid, token_hash, expires_at, now, user_agent, ip),
    )
    conn.commit()
    conn.close()
    return raw_token

def _validate_remember_token(raw_token: str) -> Optional[dict]:
    """
    Validează un token brut. Returnează rândul din DB dacă token-ul este valid
    și nu a expirat, altfel None.
    """
    token_hash = _hash_token(raw_token)
    conn = _users_connect()
    row = conn.execute(
        "SELECT * FROM remember_tokens WHERE token_hash = ?", (token_hash,)
    ).fetchone()
    conn.close()

    if not row:
        return None

    row_dict = dict(row)
    expires_at = datetime.fromisoformat(row_dict["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        # Token expirat — ștergem
        _revoke_remember_token_by_hash(token_hash)
        return None

    return row_dict

def _rotate_remember_token(old_token: str, uid: str, user_agent: str = None, ip: str = None) -> str:
    """
    Rotație token: invalidează token-ul vechi și creează unul nou.
    Previne atacuri de tip replay.
    """
    _revoke_remember_token_by_hash(_hash_token(old_token))
    return _create_remember_token(uid, user_agent, ip)

def _revoke_remember_token_by_hash(token_hash: str):
    """Șterge un token din DB pe baza hash-ului."""
    conn = _users_connect()
    conn.execute("DELETE FROM remember_tokens WHERE token_hash = ?", (token_hash,))
    conn.commit()
    conn.close()

def _revoke_all_remember_tokens(uid: str) -> int:
    """Revocă toate token-urile de remember ale unui utilizator. Returnează câte au fost șterse."""
    conn = _users_connect()
    cur = conn.execute("DELETE FROM remember_tokens WHERE uid = ?", (uid,))
    count = cur.rowcount
    conn.commit()
    conn.close()
    return count

def _cleanup_expired_tokens():
    """Șterge token-urile expirate din DB."""
    conn = _users_connect()
    conn.execute("DELETE FROM remember_tokens WHERE expires_at < ?",
                 (datetime.now(timezone.utc).isoformat(),))
    conn.commit()
    conn.close()

def _get_active_sessions(uid: str) -> list[dict]:
    """Returnează toate sesiunile active ale unui utilizator."""
    conn = _users_connect()
    rows = conn.execute(
        """SELECT id, created_at, expires_at, user_agent, ip
           FROM remember_tokens WHERE uid = ? AND expires_at > ?
           ORDER BY created_at DESC""",
        (uid, datetime.now(timezone.utc).isoformat()),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

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


def _has_active_access(user: dict) -> bool:
    """
    Determine if a user currently has access to paid features.
    Access is granted when:
      - status is 'active' (normal or cancel_at_period_end=true, still within period)
      - OR status is 'canceled'/'past_due' BUT current_period_end is still in the future
    This ensures users who cancel keep access until their billing period ends.
    """
    status = user.get("status", "inactive")
    if status == "active":
        return True
    # For canceled/past_due, check if the paid period hasn't ended yet
    if status in ("canceled", "past_due"):
        period_end_str = user.get("current_period_end")
        if period_end_str:
            try:
                period_end = datetime.fromisoformat(period_end_str)
                if period_end.tzinfo is None:
                    period_end = period_end.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) < period_end:
                    return True
            except (ValueError, TypeError):
                pass
    return False


def get_user_subscription(uid: str) -> dict:
    """Get subscription info with tier limits for a user."""
    _dbg: list[str] = []          # collect debug breadcrumbs

    user = _get_user(uid)
    _dbg.append(f"1_user_in_db={'YES' if user else 'NO'}")

    # ── Whitelist: Elite Access ──────────────────────────────────────────────
    # Runs BEFORE the user-not-found check so whitelisted users work even
    # after a Railway redeploy that wipes the SQLite DB.
    #
    # WHITELISTED_EMAILS        = permanent elite (comma-separated emails)
    # WHITELIST_TIMED           = time-limited elite (email:YYYY-MM-DD,email2:YYYY-MM-DD)
    whitelist_env = os.environ.get("WHITELISTED_EMAILS", "")
    whitelisted_emails = {e.strip().lower() for e in whitelist_env.split(",") if e.strip()}

    timed_env = os.environ.get("WHITELIST_TIMED", "")
    timed_whitelist: dict[str, str] = {}
    for entry in timed_env.split(","):
        entry = entry.strip()
        if ":" in entry:
            email_part, date_part = entry.rsplit(":", 1)
            timed_whitelist[email_part.strip().lower()] = date_part.strip()

    all_whitelist = whitelisted_emails | set(timed_whitelist.keys())
    _dbg.append(f"2_whitelist_count={len(all_whitelist)}")

    if all_whitelist:
        # Get email from local DB, or fall back to Firebase Auth
        user_email = ""
        if user:
            user_email = user.get("email", "").lower()
        elif firebase_app:
            try:
                fb_user = firebase_auth.get_user(uid)
                user_email = (fb_user.email or "").lower()
                # Auto-create user record so future lookups succeed
                if user_email:
                    _upsert_user(uid, user_email, "firebase")
                    user = _get_user(uid)
            except Exception as e:
                print(f"⚠️ [Whitelist] Could not look up Firebase user {uid}: {e}", flush=True)

        if user_email and user_email in all_whitelist:
            _dbg.append(f"3_whitelisted=YES")
            # Determine expiry
            if user_email in timed_whitelist:
                try:
                    expiry = datetime.fromisoformat(timed_whitelist[user_email]).replace(tzinfo=timezone.utc)
                    if datetime.now(timezone.utc) > expiry:
                        print(f"ℹ️ [Whitelist] Timed whitelist expired for {user_email} (expired {timed_whitelist[user_email]})", flush=True)
                    else:
                        return {
                            "plan": "elite",
                            "status": "active",
                            "current_period_end": expiry.isoformat(),
                            "cancel_at_period_end": False,
                            "has_access": True,
                            "tier_limits": TIER_LIMITS["elite"],
                        }
                except ValueError:
                    print(f"⚠️ [Whitelist] Invalid date for {user_email}: {timed_whitelist[user_email]}", flush=True)
            else:
                # Permanent whitelist
                return {
                    "plan": "elite",
                    "status": "active",
                    "current_period_end": (datetime.now(timezone.utc) + timedelta(days=365*10)).isoformat(),
                    "cancel_at_period_end": False,
                    "has_access": True,
                    "tier_limits": TIER_LIMITS["elite"],
                }
    # ───────────────────────────────────────────────────────────────────────────

    # ── Auto-recover user after Railway redeploy wiped SQLite DB ──────────────
    # If the user is authenticated (we have their uid) but has no local record,
    # recreate it from Firebase Auth and look up their Stripe customer by email.
    _dbg.append(f"4_user_before_recovery={'YES' if user else 'NO'}")
    if not user and firebase_app:
        try:
            fb_user = firebase_auth.get_user(uid)
            if fb_user.email:
                print(f"🔄 [Recovery] User {uid} ({fb_user.email}) not in DB — recreating from Firebase", flush=True)
                fb_profile = _get_profile_from_firebase(uid)
                _upsert_user(
                    uid, fb_user.email, "firebase",
                    full_name=fb_profile.get("full_name"),
                    date_of_birth=fb_profile.get("date_of_birth"),
                )
                # Try to find their Stripe customer by email
                if stripe.api_key:
                    try:
                        customers = stripe.Customer.list(email=fb_user.email, limit=1)
                        if customers.data:
                            cust_id = customers.data[0].id
                            _update_user_subscription(uid, stripe_customer_id=cust_id)
                            print(f"✅ [Recovery] Linked Stripe customer {cust_id} for {fb_user.email}", flush=True)
                        else:
                            print(f"ℹ️ [Recovery] No Stripe customer found for email {fb_user.email}", flush=True)
                    except Exception as e:
                        print(f"⚠️ [Recovery] Stripe customer lookup failed for {fb_user.email}: {e}", flush=True)
                user = _get_user(uid)
                print(f"✅ [Recovery] User recreated: stripe_customer_id={user.get('stripe_customer_id') if user else 'N/A'}", flush=True)
        except Exception as e:
            print(f"⚠️ [Recovery] Could not look up Firebase user {uid}: {e}", flush=True)

    if not user:
        _dbg.append("5_NO_USER_RETURNING_INACTIVE")
        return {
            "plan": None,
            "status": "inactive",
            "current_period_end": None,
            "cancel_at_period_end": False,
            "has_access": False,
            "tier_limits": None,
            "_debug": _dbg,
        }

    # ── Link Stripe customer if missing ───────────────────────────────────────
    # The whitelist check may have created the user record (to look up their
    # email) without linking their Stripe customer.  Ensure it's linked here.
    _dbg.append(f"6_stripe_cid={user.get('stripe_customer_id') or 'NONE'}")
    _dbg.append(f"6_stripe_api_key={'SET' if stripe.api_key else 'MISSING'}")
    if not user.get("stripe_customer_id") and stripe.api_key:
        user_email = user.get("email", "")
        _dbg.append(f"7_link_search_email={user_email}")
        if user_email:
            try:
                customers = stripe.Customer.list(email=user_email, limit=1)
                _dbg.append(f"7_link_customers_found={len(customers.data)}")
                if customers.data:
                    cust_id = customers.data[0].id
                    _update_user_subscription(uid, stripe_customer_id=cust_id)
                    user = _get_user(uid)
                    print(f"🔗 [Link] Linked Stripe customer {cust_id} for {user_email}", flush=True)
                else:
                    # Fallback: try original-case email from Firebase
                    try:
                        fb_user_link = firebase_auth.get_user(uid)
                        orig_email = fb_user_link.email or ""
                        if orig_email and orig_email != user_email:
                            _dbg.append(f"7_link_retry_email={orig_email}")
                            customers = stripe.Customer.list(email=orig_email, limit=1)
                            _dbg.append(f"7_link_retry_found={len(customers.data)}")
                            if customers.data:
                                cust_id = customers.data[0].id
                                _update_user_subscription(uid, stripe_customer_id=cust_id)
                                user = _get_user(uid)
                                print(f"🔗 [Link] Linked Stripe customer {cust_id} for {orig_email} (original case)", flush=True)
                    except Exception:
                        pass
            except Exception as e:
                _dbg.append(f"7_link_error={e}")
                print(f"⚠️ [Link] Stripe customer lookup failed for {user_email}: {e}", flush=True)

    plan = user.get("plan")
    status = user.get("status", "inactive")
    cancel_at = bool(user.get("cancel_at_period_end", 0))

    # ── Sync from Stripe when local state is incomplete or stale ──────────────
    # Triggers when:
    #   1. Status is not "active" and user has no access (inactive/expired), OR
    #   2. Plan data is missing (DB was reset, or old cancel bug wiped it), OR
    #   3. Status was set to "canceled" but Stripe still has an active subscription
    has_stripe = bool(user.get("stripe_customer_id")) and bool(stripe.api_key)
    needs_stripe_sync = has_stripe and (
        status not in ("active",)  # always sync if not explicitly active
        or not plan                # plan is missing
    )
    _dbg.append(f"8_has_stripe={has_stripe}_needs_sync={needs_stripe_sync}_status={status}_plan={plan}")
    if needs_stripe_sync:
        try:
            # First try: look for active subscriptions (includes cancel_at_period_end=true)
            subs = stripe.Subscription.list(
                customer=user["stripe_customer_id"],
                status="active",
                limit=1,
            )
            # Second try: if no active subs, check for any recent subscription
            # (handles edge case where Stripe webhook delay changed status)
            if not subs.data:
                subs = stripe.Subscription.list(
                    customer=user["stripe_customer_id"],
                    limit=1,
                )
            _dbg.append(f"9_subs_found={len(subs.data)}")
            if subs.data:
                sub = subs.data[0]
                stripe_status = _sg(sub, "status", "canceled")
                price_id = sub["items"]["data"][0]["price"]["id"]
                synced_plan = PRICE_TO_PLAN.get(price_id)
                _dbg.append(f"9_stripe_status={stripe_status}_price={price_id}_plan={synced_plan}")
                cancel_at_flag = bool(_sg(sub, "cancel_at_period_end", False))
                period_end_ts = _stripe_period_end(sub)
                _dbg.append(f"9_period_end_ts={period_end_ts}")

                if period_end_ts:
                    period_end = datetime.fromtimestamp(period_end_ts, tz=timezone.utc).isoformat()
                    period_end_dt = datetime.fromtimestamp(period_end_ts, tz=timezone.utc)
                else:
                    # No period end found — if status is active, grant access with a synthetic far-future period
                    period_end = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat() if stripe_status == "active" else None
                    period_end_dt = datetime.now(timezone.utc) + timedelta(days=30) if stripe_status == "active" else datetime.min.replace(tzinfo=timezone.utc)

                if stripe_status == "active" or datetime.now(timezone.utc) < period_end_dt:
                    plan = synced_plan or plan or "unknown"
                    status = stripe_status
                    cancel_at = cancel_at_flag
                    _update_user_subscription(
                        uid,
                        stripe_subscription_id=_sg(sub, "id"),
                        plan=plan,
                        status=status,
                        current_period_end=period_end,
                        cancel_at_period_end=1 if cancel_at else 0,
                    )
                    user = _get_user(uid)
                    print(f"🔄 [Sync] User {uid} synced from Stripe: plan={plan}, status={status}, "
                          f"cancel_at_period_end={cancel_at}, period_end={period_end}", flush=True)
                else:
                    print(f"ℹ️ [Sync] User {uid}: Stripe sub found but expired (status={stripe_status}, "
                          f"period_end={period_end})", flush=True)
            else:
                print(f"ℹ️ [Sync] User {uid}: No Stripe subscriptions found for customer "
                      f"{user['stripe_customer_id']}", flush=True)
        except Exception as e:
            _dbg.append(f"9_sync_error={e}")
            print(f"⚠️ [Sync] Failed to check Stripe for {uid}: {e}", flush=True)

    # ── Compute final access decision ─────────────────────────────────────────
    has_access = _has_active_access(user) if user else False
    limits = TIER_LIMITS.get(plan) if plan and has_access else None
    _dbg.append(f"10_final_has_access={has_access}_plan={plan}_status={status}")

    # Safety net: if user has access but we lost the plan (shouldn't happen after
    # sync, but guard against it), fallback to minimum tier so they aren't locked out
    if has_access and not plan:
        print(f"⚠️ [Safety] User {uid} has access but no plan — defaulting to 'weekly'", flush=True)
        plan = "weekly"
        limits = TIER_LIMITS["weekly"]

    return {
        "plan": plan if has_access else None,
        "status": status,
        "current_period_end": user.get("current_period_end"),
        "cancel_at_period_end": cancel_at,
        "has_access": has_access,
        "tier_limits": limits,
        "_debug": _dbg,
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

    full_name = data.full_name
    date_of_birth = data.date_of_birth

    # If profile fields are missing, recover from Firebase Auth (survives DB resets)
    if not full_name or not date_of_birth:
        fb_profile = _get_profile_from_firebase(data.uid)
        if not full_name:
            full_name = fb_profile.get("full_name")
        if not date_of_birth:
            date_of_birth = fb_profile.get("date_of_birth")

    # Validate age (must be 18+)
    if date_of_birth:
        try:
            dob = datetime.fromisoformat(date_of_birth)
            today = datetime.now(timezone.utc)
            age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
            if age < 18:
                raise HTTPException(status_code=400, detail="Trebuie să ai cel puțin 18 ani pentru a te înregistra.")
        except ValueError:
            raise HTTPException(status_code=400, detail="Data nașterii nu este validă.")

    _upsert_user(data.uid, data.email, data.provider, full_name, date_of_birth)

    # Persist profile to Firebase so it survives Railway redeploys / DB resets
    if data.full_name or data.date_of_birth:
        _save_profile_to_firebase(data.uid, data.full_name, data.date_of_birth)

    return {"status": "ok", "message": "Utilizator înregistrat cu succes."}


@billing_router.get("/api/auth/profile")
async def get_profile(authorization: Optional[str] = Header(default=None)):
    """Get the current user's profile info."""
    decoded = await verify_firebase_token(authorization)
    uid = decoded["uid"]
    user = _get_user(uid)

    full_name = user.get("full_name") if user else None
    date_of_birth = user.get("date_of_birth") if user else None
    email = user.get("email", decoded.get("email", "")) if user else decoded.get("email", "")
    provider = user.get("provider") if user else None

    # If profile data is missing from SQLite, recover from Firebase
    if not full_name or not date_of_birth:
        fb_profile = _get_profile_from_firebase(uid)
        if not full_name:
            full_name = fb_profile.get("full_name")
        if not date_of_birth:
            date_of_birth = fb_profile.get("date_of_birth")
        # Backfill SQLite so future reads are fast
        if (full_name or date_of_birth) and user:
            _upsert_user(uid, email, provider or "email", full_name, date_of_birth)

    return {
        "uid": uid,
        "email": email,
        "full_name": full_name,
        "date_of_birth": date_of_birth,
        "provider": provider,
    }


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    date_of_birth: Optional[str] = None

@billing_router.put("/api/auth/profile")
async def update_profile(data: UpdateProfileRequest, authorization: Optional[str] = Header(default=None)):
    """Update the current user's profile info."""
    decoded = await verify_firebase_token(authorization)
    uid = decoded["uid"]
    user = _get_user(uid)
    if not user:
        raise HTTPException(status_code=404, detail="Utilizatorul nu a fost găsit.")

    if data.date_of_birth:
        try:
            dob = datetime.fromisoformat(data.date_of_birth)
            today = datetime.now(timezone.utc)
            age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
            if age < 18:
                raise HTTPException(status_code=400, detail="Trebuie să ai cel puțin 18 ani.")
        except ValueError:
            raise HTTPException(status_code=400, detail="Data nașterii nu este validă.")

    updates = {}
    if data.full_name is not None:
        updates["full_name"] = data.full_name.strip()
    if data.date_of_birth is not None:
        updates["date_of_birth"] = data.date_of_birth

    if updates:
        conn = _users_connect()
        now = datetime.now(timezone.utc).isoformat()
        sets = ["updated_at = ?"]
        vals = [now]
        for k, v in updates.items():
            sets.append(f"{k} = ?")
            vals.append(v)
        vals.append(uid)
        conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE uid = ?", vals)
        conn.commit()
        conn.close()
        # Persist to Firebase so updates survive DB resets
        _save_profile_to_firebase(uid, updates.get("full_name"), updates.get("date_of_birth"))

    return {"status": "ok", "message": "Profilul a fost actualizat cu succes."}


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
        sub = stripe.Subscription.modify(
            user["stripe_subscription_id"],
            cancel_at_period_end=True,
        )
        # Keep status as "active" — user retains access until period end
        pe_ts = _stripe_period_end(sub)
        period_end = datetime.fromtimestamp(pe_ts, tz=timezone.utc).isoformat() if pe_ts else (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        _update_user_subscription(
            uid,
            cancel_at_period_end=1,
            current_period_end=period_end,
        )
        return {
            "status": "ok",
            "message": "Abonamentul va fi anulat la sfârșitul perioadei curente.",
            "current_period_end": period_end,
        }
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
                pe_ts = _stripe_period_end(subs.data[0])
                period_end = datetime.fromtimestamp(pe_ts, tz=timezone.utc).isoformat() if pe_ts else (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
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
            # Upgrade: prorate and require payment before applying
            stripe.Subscription.modify(
                stripe_sub_id,
                items=[{"id": current_item_id, "price": data.price_id}],
                proration_behavior="create_prorations",
                payment_behavior="pending_if_incomplete",
            )
            # DB update is handled by customer.subscription.updated webhook after payment succeeds
            return {"status": "ok", "message": f"Upgrade-ul la {new_plan.capitalize()} va fi activat dupa procesarea platii.", "effective": "after_payment"}
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


def _handle_checkout_completed(session):
    """After successful checkout, activate subscription."""
    meta = _sg(session, "metadata") or {}
    uid = _sg(meta, "firebase_uid")
    subscription_id = _sg(session, "subscription")

    if not uid or not subscription_id:
        print(f"⚠️ [Webhook] checkout.session.completed: Missing uid or subscription_id")
        return

    try:
        sub = stripe.Subscription.retrieve(subscription_id)
        price_id = sub["items"]["data"][0]["price"]["id"]
        plan = PRICE_TO_PLAN.get(price_id, "unknown")
        pe_ts = _stripe_period_end(sub)
        period_end = datetime.fromtimestamp(pe_ts, tz=timezone.utc).isoformat() if pe_ts else (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

        _update_user_subscription(
            uid,
            stripe_subscription_id=subscription_id,
            plan=plan,
            status="active",
            current_period_end=period_end,
            cancel_at_period_end=0,
        )
        print(f"✅ [Webhook] User {uid} → plan: {plan}, status: active")
    except Exception as e:
        print(f"❌ [Webhook] Error processing checkout: {e}")


def _handle_subscription_updated(subscription):
    """Subscription renewed, plan changed, or status changed."""
    customer_id = _sg(subscription, "customer")
    subscription_id = _sg(subscription, "id")
    status = _sg(subscription, "status")
    price_id = subscription["items"]["data"][0]["price"]["id"]
    plan = PRICE_TO_PLAN.get(price_id, "unknown")
    pe_ts = _stripe_period_end(subscription)
    period_end = datetime.fromtimestamp(pe_ts, tz=timezone.utc).isoformat() if pe_ts else (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    cancel_at = 1 if _sg(subscription, "cancel_at_period_end", False) else 0

    user = _get_user_by_stripe_customer(customer_id)

    # If user not found (DB was wiped), try to recover via subscription metadata
    if not user:
        meta = _sg(subscription, "metadata") or {}
        uid = _sg(meta, "firebase_uid")
        if uid and firebase_app:
            try:
                fb_user = firebase_auth.get_user(uid)
                if fb_user.email:
                    _upsert_user(uid, fb_user.email, "firebase")
                    _update_user_subscription(uid, stripe_customer_id=customer_id)
                    user = _get_user(uid)
                    print(f"🔄 [Webhook] Recovered user {uid} from Firebase during subscription.updated", flush=True)
            except Exception as e:
                print(f"⚠️ [Webhook] subscription.updated: Could not recover user for customer {customer_id}: {e}", flush=True)

    if not user:
        print(f"⚠️ [Webhook] subscription.updated: No user found for customer {customer_id}", flush=True)
        return

    _update_user_subscription(
        user["uid"],
        stripe_subscription_id=subscription_id,
        plan=plan,
        status=status,
        current_period_end=period_end,
        cancel_at_period_end=cancel_at,
    )
    print(f"📝 [Webhook] Subscription updated: {user['uid']} → {plan}/{status} (cancel_at_period_end={bool(cancel_at)})")


def _handle_subscription_deleted(subscription):
    """Subscription was fully canceled/expired — period has ended, revoke access now."""
    customer_id = _sg(subscription, "customer")
    subscription_id = _sg(subscription, "id")

    user = _get_user_by_stripe_customer(customer_id)
    if not user:
        print(f"⚠️ [Webhook] subscription.deleted: No user found for customer {customer_id}")
        return

    _update_user_subscription(
        user["uid"],
        status="canceled",
        plan=None,
        stripe_subscription_id=None,
        cancel_at_period_end=0,
    )
    print(f"🚫 [Webhook] Subscription fully ended: {user['uid']}")


def _handle_payment_failed(invoice):
    """Payment failed on renewal — mark as past_due."""
    customer_id = _sg(invoice, "customer")
    subscription_id = _sg(invoice, "subscription")

    user = _get_user_by_stripe_customer(customer_id)
    if not user:
        print(f"⚠️ [Webhook] payment_failed: No user found for customer {customer_id}")
        return

    _update_user_subscription(user["uid"], status="past_due")
    print(f"⚠️ [Webhook] Payment failed: {user['uid']} → past_due")


# ── Support Tickets ───────────────────────────────────────────────────────────

PLAN_PRIORITY = {"elite": 1, "pro": 2, "weekly": 3}

def init_support_db():
    """Create support_tickets table if it doesn't exist."""
    conn = _users_connect()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS support_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT,
            email TEXT NOT NULL,
            plan TEXT,
            priority INTEGER DEFAULT 9,
            message TEXT NOT NULL,
            attachment_path TEXT,
            status TEXT DEFAULT 'open',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

@billing_router.post("/api/support/ticket")
async def create_support_ticket(request: Request, authorization: Optional[str] = Header(default=None)):
    """Submit a support ticket. Authenticated users get priority based on plan."""
    import shutil

    form = await request.form()
    email = form.get("email", "").strip()
    message = form.get("message", "").strip()
    attachment = form.get("attachment")

    if not email:
        raise HTTPException(status_code=400, detail="Adresa de email este obligatorie.")
    if not message:
        raise HTTPException(status_code=400, detail="Mesajul este obligatoriu.")
    if len(message) > 5000:
        raise HTTPException(status_code=400, detail="Mesajul nu poate depăși 5000 de caractere.")

    uid = None
    plan = None
    priority = 9  # lowest for unauthenticated

    if authorization and authorization.startswith("Bearer "):
        try:
            decoded = await verify_firebase_token(authorization)
            uid = decoded["uid"]
            user = _get_user(uid)
            if user:
                plan = user.get("plan")
                priority = PLAN_PRIORITY.get(plan, 9)
        except Exception:
            pass  # allow ticket submission even if auth fails

    # Save attachment if provided
    attachment_path = None
    if attachment and hasattr(attachment, "filename") and attachment.filename:
        allowed_ext = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".doc", ".docx", ".txt"}
        ext = os.path.splitext(attachment.filename)[1].lower()
        if ext not in allowed_ext:
            raise HTTPException(status_code=400, detail="Tip de fișier neacceptat.")
        if attachment.size and attachment.size > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Fișierul nu poate depăși 5 MB.")

        os.makedirs("support_attachments", exist_ok=True)
        safe_name = f"{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uid or 'anon'}{ext}"
        save_path = os.path.join("support_attachments", safe_name)
        with open(save_path, "wb") as f:
            content = await attachment.read()
            f.write(content)
        attachment_path = save_path

    init_support_db()
    conn = _users_connect()
    conn.execute(
        """INSERT INTO support_tickets (uid, email, plan, priority, message, attachment_path)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (uid, email, plan, priority, message, attachment_path),
    )
    conn.commit()
    conn.close()

    print(f"📩 [Support] New ticket from {email} (plan: {plan or 'none'}, priority: {priority})")

    # ── Send email notification to owner ──────────────────────────────
    try:
        _send_support_email(email, message, plan, priority, attachment_path)
    except Exception as exc:
        print(f"⚠️ [Support] Email notification failed: {exc}")

    return {"status": "ok", "message": "Cererea a fost trimisă cu succes."}

# ── Support Email Helper ──────────────────────────────────────────────────────

def _send_support_email(user_email: str, message: str, plan: str | None, priority: int, attachment_path: str | None = None):
    """Send support ticket details to contact@ggai.bet via Zoho SMTP."""
    smtp_user = os.environ.get("ZOHO_SMTP_USER", "contact@ggai.bet")
    smtp_pass = os.environ.get("ZOHO_SMTP_PASS", "")
    if not smtp_pass:
        print("⚠️ [Support] ZOHO_SMTP_PASS not set — skipping email notification.")
        return

    owner_email = "contact@ggai.bet"

    msg = MIMEMultipart()
    msg["From"] = smtp_user
    msg["To"] = owner_email
    msg["Subject"] = f"[Suport GG-AI] Cerere nouă de la {user_email}"

    body = (
        f"📩 Cerere nouă de suport\n"
        f"{'─' * 40}\n"
        f"Email:     {user_email}\n"
        f"Plan:      {plan or 'none'}\n"
        f"Prioritate: {priority}\n"
        f"{'─' * 40}\n\n"
        f"{message}\n"
    )
    msg.attach(MIMEText(body, "plain", "utf-8"))

    if attachment_path and os.path.isfile(attachment_path):
        with open(attachment_path, "rb") as f:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f"attachment; filename={os.path.basename(attachment_path)}")
        msg.attach(part)

    with smtplib.SMTP("smtp.zoho.eu", 587) as server:
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)

    print(f"✅ [Support] Email sent to {owner_email}")

# ── Remember Me Endpoints ─────────────────────────────────────────────────────

class RememberMeRequest(BaseModel):
    remember: bool = False

@billing_router.post("/api/auth/remember")
async def create_remember_session(
    request: Request,
    body: RememberMeRequest,
    authorization: Optional[str] = Header(default=None),
):
    """
    Creează un token "Ține-mă minte" și îl setează ca cookie HttpOnly.
    Se apelează după autentificarea cu succes, doar dacă utilizatorul a bifat opțiunea.
    """
    decoded = await verify_firebase_token(authorization)
    uid = decoded["uid"]

    user_agent = request.headers.get("user-agent", "unknown")
    ip = request.client.host if request.client else "unknown"

    response = JSONResponse({"status": "ok", "remember": body.remember})

    if body.remember:
        raw_token = _create_remember_token(uid, user_agent, ip)
        response.set_cookie(
            key="remember_token",
            value=raw_token,
            max_age=REMEMBER_TOKEN_DAYS * 24 * 60 * 60,
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
        )
        # Cookie de sesiune cu UID-ul (pentru middleware Next.js)
        response.set_cookie(
            key="token",
            value=uid,
            max_age=REMEMBER_TOKEN_DAYS * 24 * 60 * 60,
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
        )
    else:
        # Sesiune fără persistență — cookie de sesiune (fără max_age = se șterge la închidere)
        response.set_cookie(
            key="token",
            value=uid,
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
        )

    return response

@billing_router.post("/api/auth/validate-remember")
async def validate_remember(request: Request):
    """
    Validează un token de remember din cookie.
    Dacă token-ul este valid, face rotație (înlocuiește cu un token nou)
    și returnează UID-ul utilizatorului.
    """
    raw_token = request.cookies.get("remember_token")
    if not raw_token:
        raise HTTPException(status_code=401, detail="Cookie de remember lipsă.")

    token_data = _validate_remember_token(raw_token)
    if not token_data:
        # Token invalid sau expirat — ștergem cookie-urile
        response = JSONResponse(
            status_code=401,
            content={"detail": "Token de remember invalid sau expirat."},
        )
        response.delete_cookie("remember_token", path="/")
        response.delete_cookie("token", path="/")
        return response

    uid = token_data["uid"]
    user_agent = request.headers.get("user-agent", "unknown")
    ip = request.client.host if request.client else "unknown"

    # Rotație token — securitate contra replay attacks
    new_token = _rotate_remember_token(raw_token, uid, user_agent, ip)

    response = JSONResponse({
        "status": "ok",
        "uid": uid,
    })
    response.set_cookie(
        key="remember_token",
        value=new_token,
        max_age=REMEMBER_TOKEN_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        key="token",
        value=uid,
        max_age=REMEMBER_TOKEN_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    return response

@billing_router.post("/api/auth/logout")
async def logout_remember(request: Request, authorization: Optional[str] = Header(default=None)):
    """
    Invalidează token-ul de remember la deconectare și șterge cookie-urile.
    """
    # Invalidare token din DB
    raw_token = request.cookies.get("remember_token")
    if raw_token:
        token_hash = _hash_token(raw_token)
        _revoke_remember_token_by_hash(token_hash)

    response = JSONResponse({"status": "ok", "message": "Deconectat cu succes."})
    response.delete_cookie("remember_token", path="/")
    response.delete_cookie("token", path="/")
    return response

@billing_router.post("/api/auth/revoke-all-sessions")
async def revoke_all_sessions(authorization: Optional[str] = Header(default=None)):
    """
    Revocă toate sesiunile active ale utilizatorului curent.
    Util pentru securitate — "Deconectare de pe toate dispozitivele".
    """
    decoded = await verify_firebase_token(authorization)
    uid = decoded["uid"]
    count = _revoke_all_remember_tokens(uid)

    # Opțional: revocăm și token-urile Firebase (forțează re-autentificare pe toate dispozitivele)
    if firebase_app:
        try:
            firebase_auth.revoke_refresh_tokens(uid)
        except Exception as e:
            logging.warning(f"Nu s-au putut revoca token-urile Firebase pentru {uid}: {e}")

    return {
        "status": "ok",
        "revoked_sessions": count,
        "message": f"{count} sesiune(i) revocată(e) cu succes.",
    }

@billing_router.get("/api/auth/active-sessions")
async def list_active_sessions(authorization: Optional[str] = Header(default=None)):
    """
    Returnează lista sesiunilor active ale utilizatorului curent.
    """
    decoded = await verify_firebase_token(authorization)
    uid = decoded["uid"]
    sessions = _get_active_sessions(uid)
    return {"sessions": sessions}
