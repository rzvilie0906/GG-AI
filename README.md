# GG-AI — Analizator AI de Pariuri Sportive 🏆

Platformă SaaS de analiză AI pentru pariuri sportive. Generează bilete zilnice cu valoare, scoring de încredere și sfaturi AI pentru **fotbal**, **baschet**, **hochei**, **tenis** și **baseball**.

---

## 📁 Structura Proiectului

```
AIlie/
├── main.py                    # Server FastAPI — API principal (analiză, meciuri, bilete)
├── prompts.py                 # Prompt-uri de sistem pentru OpenAI
├── generate_ticket.py         # Generator automat bilete zilnice
├── sync_zile.py               # Sincronizare calendar meciuri ESPN (+7 zile)
├── sync_odds.py               # Sincronizare cote de la The Odds API (+2 zile)
├── auto_sync_master.py        # Script master — rulează sync_zile + sync_odds secvențial
├── landing.html               # Pagina de prezentare (landing page)
├── landing.css                # Stiluri landing page
├── landing.js                 # Interacțiuni landing page
├── index.html                 # Aplicația principală (dashboard analiză)
├── style.css                  # Stiluri aplicație
├── script.js                  # Logică frontend aplicație
├── daily_ticket_mixed.json    # Bilet zilnic mixt (generat automat)
├── daily_ticket_football.json
├── daily_ticket_basketball.json
├── daily_ticket_hockey.json
├── requirements.txt           # Dependențe Python
├── .env                       # Variabile de mediu (chei API)
├── sports.db                  # Bază de date SQLite (generată automat)
└── pricing-frontend/          # Pagina de prețuri Next.js (opțional)
```

---

## 🚀 Ghid de Pornire Pas cu Pas

### Pasul 1 — Cerințe Preliminare

Asigură-te că ai instalate:

| Componentă | Versiune minimă | Verificare |
|---|---|---|
| **Python** | 3.10+ | `python --version` |
| **pip** | 23+ | `pip --version` |
| **Git** | orice | `git --version` |

### Pasul 2 — Clonare Proiect

```bash
git clone <repo-url>
cd AIlie
```

### Pasul 3 — Creare și Activare Mediu Virtual

**Windows (PowerShell):**
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**Windows (CMD):**
```cmd
python -m venv .venv
.venv\Scripts\activate.bat
```

**Linux / macOS:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

> Vei vedea `(.venv)` în terminal când mediul virtual este activ.

### Pasul 4 — Instalare Dependențe

```bash
pip install -r requirements.txt
```

Aceasta instalează: `fastapi`, `uvicorn`, `openai`, `python-dotenv`, `pydantic`, `requests`, `httpx`.

### Pasul 5 — Configurare Variabile de Mediu

Creează fișierul `.env` în directorul rădăcină (sau editează-l dacă există deja):

```env
# === OBLIGATORIU ===
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# === AUTENTIFICARE API (cheia de acces pentru frontend) ===
APP_API_KEY=cheia_ta_secreta_aici

# === COTE (The Odds API — https://the-odds-api.com) ===
ODDS_API_KEYS=cheie1,cheie2

# === MODEL AI (opțional — implicit: gpt-4o) ===
MODEL=gpt-4o
TEMPERATURE=0
MAX_TOKENS=1200

# === CORS (opțional — implicit permite tot) ===
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

#### Unde obții cheile:

| Cheie | Sursă | Link |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI Platform | https://platform.openai.com/api-keys |
| `ODDS_API_KEYS` | The Odds API | https://the-odds-api.com |

### Pasul 6 — Sincronizare Inițială Date (Prima Rulare)

Înainte de a porni serverul, populează baza de date cu meciuri și cote:

```bash
python auto_sync_master.py
```

Acest script:
1. Rulează `sync_zile.py` — descarcă meciurile din ESPN pe următoarele 7 zile
2. Rulează `sync_odds.py` — descarcă cotele de la The Odds API pe +2 zile
3. Creează/actualizează `sports.db`

> **Programare automată:** Rulează zilnic la **09:00** prin scheduler (cron / Task Scheduler).
> **Durată estimată:** 1–3 minute, depinde de conexiune.

### Pasul 7 — Generare Bilete Zilnice (Opțional)

Pentru a genera biletele zilnice AI (mixt, fotbal, baschet, hochei):

```bash
python generate_ticket.py
```

Aceasta creează/actualizează fișierele:
- `daily_ticket_mixed.json`
- `daily_ticket_football.json`
- `daily_ticket_basketball.json`
- `daily_ticket_hockey.json`

> **Notă:** Consumă credite OpenAI. Biletele sunt disponibile de la **10:00** zilnic.

### Pasul 8 — Pornire Server

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Ar trebui să vezi:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

#### Verificare rapidă:

Deschide în browser: [http://localhost:8000/health](http://localhost:8000/health)

Răspuns așteptat:
```json
{"ok": true}
```

### Pasul 9 — Deschide Aplicația

Ai două opțiuni de a accesa frontend-ul:

#### Opțiunea A: Deschide direct fișierele HTML (cel mai simplu)

1. **Landing Page:** Deschide `landing.html` în browser (click dreapta → Open With → Browser)
2. **Dashboard Analiză:** Deschide `index.html` în browser

> **Notă:** Asigură-te că serverul FastAPI rulează pe portul 8000.

#### Opțiunea B: Servește cu un server static (recomandat)

```bash
# Într-un terminal separat (cu venv activ):
python -m http.server 3000
```

Apoi deschide:
- **Landing Page:** [http://localhost:3000/landing.html](http://localhost:3000/landing.html)
- **Dashboard:** [http://localhost:3000/index.html](http://localhost:3000/index.html)

---

## 🔌 Endpoint-uri API Disponibile

| Endpoint | Metodă | Descriere |
|---|---|---|
| `/health` | GET | Status server |
| `/sports` | GET | Lista de sporturi disponibile |
| `/dates` | GET | Data implicită + sugestii |
| `/leagues` | GET | Ligi disponibile per sport/dată |
| `/fixtures` | GET | Meciuri per sport/dată/ligă |
| `/context` | GET | Context meci (analiză salvată) |
| `/analyze` | POST | Analiză AI completă a unui meci |
| `/analyze-ticket` | POST | Evaluare risc bilet personal |
| `/daily-ticket` | GET | Biletul zilei (mixed/football/basketball/hockey) |

---

## 🗓 Flux Zilnic (Automat)

```
10:00            →  Biletele zilnice devin disponibile pentru utilizatori
09:00            →  Rulează auto_sync_master.py (meciuri +7 zile + cote +2 zile)
09:01+           →  Utilizatorii accesează platforma, analizează meciuri cu date actualizate
```

> `auto_sync_master.py` rulează **zilnic la 09:00** și actualizează calendarul de meciuri pe următoarele 7 zile + cotele pe +2 zile.
> Serverul FastAPI are și el un worker de fundal (`auto_sync_worker`) care re-sincronizează la fiecare 24h.

---

## 📂 Baza de Date (SQLite)

Fișierul `sports.db` este creat automat. Conține:

| Tabel | Descriere |
|---|---|
| `events` | Meciuri (id, sport, ligă, echipe, data, status, provider) |
| `match_odds` | Cote agregate per meci (bookmakers JSON) |
| `saved_analyses` | Analize AI salvate (cache per meci) |

---

## 🔧 Troubleshooting

### Eroare: `OPENAI_API_KEY nu este setat`
→ Verifică fișierul `.env` și asigură-te că cheia este corectă.

### Eroare: `OFFLINE` în interfață
→ Serverul FastAPI nu rulează. Pornește cu `uvicorn main:app --port 8000`.

### Nu apar meciuri în dashboard
→ Rulează `python auto_sync_master.py` pentru a popula baza de date.

### Biletul zilei nu apare
→ Rulează `python generate_ticket.py` pentru a genera biletele.

### Eroare CORS
→ Adaugă URL-ul frontend-ului în `ALLOWED_ORIGINS` din `.env`.

---

## 🏗 Arhitectura Sistemului

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Landing Page    │     │  FastAPI Server   │────▶│  OpenAI API  │
│  (landing.html)  │     │  (main.py :8000)  │     │  (GPT-4o)    │
└────────┬────────┘     └───────┬──────────┘     └──────────────┘
         │                      │
         ▼                      │
┌─────────────────┐     ┌───────┴──────────┐     ┌──────────────┐
│  Dashboard App   │────▶│  SQLite DB       │◀────│  ESPN API    │
│  (index.html)    │     │  (sports.db)     │     │  The Odds API│
└─────────────────┘     └──────────────────┘     └──────────────┘
                                ▲
                                │
                        ┌───────┴──────────┐
                        │  Sync Scripts     │
                        │  sync_zile.py     │
                        │  sync_odds.py     │
                        │  generate_ticket  │
                        └──────────────────┘
```

---

## ⚠️ Disclaimer

Pariurile implică risc financiar. Niciun sistem nu garantează câștiguri 100%. Această platformă este un instrument de analiză, nu un sfat financiar. Pariază responsabil. 18+.
