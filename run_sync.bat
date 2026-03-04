@echo off
cd /d C:\Users\razva\AIlie
call .venv\Scripts\activate.bat
python auto_sync_master.py >> sync_log.txt 2>&1
