@echo off
cd /d C:\Users\razva\AIlie
call .venv\Scripts\activate.bat
python generate_ticket.py >> ticket_log.txt 2>&1
