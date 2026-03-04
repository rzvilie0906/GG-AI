import time
import subprocess
import sys

def main():
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

if __name__ == "__main__":
    main()