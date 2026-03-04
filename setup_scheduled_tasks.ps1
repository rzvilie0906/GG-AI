# ============================================================
# setup_scheduled_tasks.ps1
# Run this ONCE as Administrator to register both daily tasks
# ============================================================

# ---------- Task 1: auto_sync_master.py at 09:00 ----------
$syncAction  = New-ScheduledTaskAction `
    -Execute "C:\Users\razva\AIlie\run_sync.bat" `
    -WorkingDirectory "C:\Users\razva\AIlie"

$syncTrigger = New-ScheduledTaskTrigger -Daily -At 09:00

$syncSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask `
    -TaskName "GG-AI Sync (09:00)" `
    -Action $syncAction `
    -Trigger $syncTrigger `
    -Settings $syncSettings `
    -Description "Runs auto_sync_master.py daily at 09:00 to sync matches and odds" `
    -RunLevel Highest `
    -Force

Write-Host "[OK] Task 'GG-AI Sync (09:00)' registered." -ForegroundColor Green

# ---------- Task 2: generate_ticket.py at 10:00 ----------
$ticketAction  = New-ScheduledTaskAction `
    -Execute "C:\Users\razva\AIlie\run_tickets.bat" `
    -WorkingDirectory "C:\Users\razva\AIlie"

$ticketTrigger = New-ScheduledTaskTrigger -Daily -At 10:00

$ticketSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask `
    -TaskName "GG-AI Tickets (10:00)" `
    -Action $ticketAction `
    -Trigger $ticketTrigger `
    -Settings $ticketSettings `
    -Description "Runs generate_ticket.py daily at 10:00 to generate daily tickets" `
    -RunLevel Highest `
    -Force

Write-Host "[OK] Task 'GG-AI Tickets (10:00)' registered." -ForegroundColor Green
Write-Host ""
Write-Host "Both tasks are now scheduled. You can verify them in Task Scheduler or run:" -ForegroundColor Cyan
Write-Host "  Get-ScheduledTask -TaskName 'GG-AI*'" -ForegroundColor Yellow
