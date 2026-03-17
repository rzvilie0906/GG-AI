import time
import subprocess
import sys
import os
import json
import sqlite3
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

load_dotenv()


def _get_firestore_client():
    cred_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY", "firebase-service-account.json")
    if not firebase_admin._apps:
        if os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        else:
            return None
    return firestore.client()


def _upload_sync_data_to_firestore(skip_odds=False):
    """Upload events and odds from local sports.db to Firestore for persistence."""
    db_fs = _get_firestore_client()
    if db_fs is None:
        print("⚠️ Firebase not initialized — skipping Firestore upload.")
        return

    if not os.path.exists("sports.db"):
        print("⚠️ sports.db not found — skipping Firestore upload.")
        return

    conn = sqlite3.connect("sports.db")
    conn.row_factory = sqlite3.Row

    # Ensure match_odds table exists (may not exist if --skip-odds was used)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS match_odds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            league_key TEXT, sport_key TEXT, match_title TEXT,
            start_time TEXT, bookmakers_json TEXT, updated_at TEXT
        )
    """)

    # Upload events in chunks (Firestore doc limit ~1MB)
    rows = conn.execute("SELECT * FROM events").fetchall()
    events_list = [dict(r) for r in rows]
    event_chunk_size = 400

    if not events_list:
        print("⚠️ No events to upload — skipping Firestore upload.")
        conn.close()
        return

    # Upload new events first, THEN delete old ones (avoid empty window)
    new_event_refs = []
    for i in range(0, len(events_list), event_chunk_size):
        chunk = events_list[i:i + event_chunk_size]
        doc_id = f"chunk_{i // event_chunk_size}"
        db_fs.collection("sync_events_new").document(doc_id).set({
            "events": chunk,
            "count": len(chunk),
        })
        new_event_refs.append(doc_id)

    # Clear old sync data and rename new to current
    old_docs = db_fs.collection("sync_events").stream()
    for doc in old_docs:
        doc.reference.delete()
    for doc_id in new_event_refs:
        data = db_fs.collection("sync_events_new").document(doc_id).get().to_dict()
        db_fs.collection("sync_events").document(doc_id).set(data)
        db_fs.collection("sync_events_new").document(doc_id).delete()

    print(f"✅ Uploaded {len(events_list)} events to Firestore ({len(new_event_refs)} chunks).")

    if skip_odds:
        # Events-only sync: do NOT touch odds in Firestore, just update events metadata
        db_fs.collection("sync_meta").document("last_sync").set({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_count": len(events_list),
        }, merge=True)  # merge=True preserves existing odds_count
        print("⏭️ skip_odds=True — preserving existing odds in Firestore.")
    else:
        # Write sync_meta immediately after events (so server knows about new events even if odds fail)
        db_fs.collection("sync_meta").document("last_sync").set({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_count": len(events_list),
            "odds_count": 0,  # Updated below if odds upload succeeds
        })

        # Upload odds with smaller chunks (bookmakers_json blobs are large, Firestore has 1MB doc limit)
        odds_rows = conn.execute("SELECT * FROM match_odds").fetchall()
        odds_cols = [desc[0] for desc in conn.execute("SELECT * FROM match_odds LIMIT 1").description] if odds_rows else []
        odds_list = [{col: row[col] for col in odds_cols} for row in odds_rows]

        old_odds = db_fs.collection("sync_odds").stream()
        for doc in old_odds:
            doc.reference.delete()

        odds_chunk_size = 50  # Smaller chunks for odds (bookmakers_json is large)
        for i in range(0, len(odds_list), odds_chunk_size):
            chunk = odds_list[i:i + odds_chunk_size]
            db_fs.collection("sync_odds").document(f"chunk_{i // odds_chunk_size}").set({
                "odds": chunk,
                "count": len(chunk),
            })
        print(f"✅ Uploaded {len(odds_list)} odds records to Firestore.")

        # Update sync_meta with final odds count
        db_fs.collection("sync_meta").document("last_sync").set({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_count": len(events_list),
            "odds_count": len(odds_list),
        })

    conn.close()

def main():
    skip_odds = "--skip-odds" in sys.argv

    print("\n" + "="*50)
    print("🚀 [MASTER SYNC] PORNIRE PROCEDURĂ DE ACTUALIZARE")
    print("="*50)

    print("\n▶️ PASUL 1: Rulăm sync_zile.py (Calendar ESPN) ...")
    try:
        subprocess.run([sys.executable, "sync_zile.py"], check=True)
        print("✅ [OK] Meciurile au fost descărcate cu succes.")
    except Exception as e:
        print(f"❌ [EROARE CRITICĂ] sync_zile.py a eșuat: {e}")
        return

    if skip_odds:
        print("\n⏭️ PASUL 2: SKIP sync_odds.py (--skip-odds flag)")
    else:
        time.sleep(3)
        print("\n▶️ PASUL 2: Rulăm sync_odds.py (Cote The Odds API) ...")
        try:
            subprocess.run([sys.executable, "sync_odds.py"], check=True)
            print("✅ [OK] Cotele au fost descărcate și actualizate cu succes.")
        except Exception as e:
            print(f"❌ [EROARE] sync_odds.py a eșuat: {e}")

    print("\n" + "="*50)
    print("🏁 [MASTER SYNC] FINALIZAT! Baza de date este pregătită pentru AI.")
    print("="*50 + "\n")

    print("\n▶️ PASUL 3: Upload date în Firestore (persistență) ...")
    try:
        _upload_sync_data_to_firestore(skip_odds=skip_odds)
    except Exception as e:
        print(f"⚠️ [WARN] Upload Firestore eșuat (non-fatal): {e}")

if __name__ == "__main__":
    main()