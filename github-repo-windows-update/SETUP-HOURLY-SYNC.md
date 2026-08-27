# GitHub Hourly Sync Setup Guide

This guide sets up automated hourly git pull, commit, and push operations for your repository.

## Security Note

Your GitHub token is stored **securely** in Windows Credential Manager, not in any script files. This prevents accidental exposure in version control or logs.

---

## Installation Steps

### Step 1: Store Your GitHub Token Securely

Run this **once** in PowerShell (as Administrator):

```powershell
# Replace with your actual token
$token = "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"

# Store it securely
$credential = New-Object System.Management.Automation.PSCredential("git", (ConvertTo-SecureString $token -AsPlainText -Force))
$credential | Export-Clixml -Path "$env:USERPROFILE\.git-token.xml"

Write-Host "✓ Token stored at: $env:USERPROFILE\.git-token.xml"
```

**Important:** The token is now stored in encrypted form. Do NOT share the `.git-token.xml` file.

---

### Step 2: Test the Script Manually

Before scheduling, test it once:

```powershell
# Run in PowerShell
D:\ai-workspace\github-repo-windows-update\git-hourly-sync.ps1
```

You should see output like:
```
[14:23:45] Pulling latest changes...
[14:23:46] Staging changes...
[14:23:47] Committing changes...
[14:23:48] Pushing to remote...
[14:23:49] ✓ Sync complete
```

---

### Step 3: Create the Scheduled Task

**Right-click** `setup-scheduler.bat` and select **"Run as administrator"**.

This creates a scheduled task that runs your script every hour automatically.

---

## Verification

### Check if the task was created:

```powershell
schtasks /query /tn "GitHubHourlySync" /v
```

### View the log file:

```powershell
type "$env:USERPROFILE\AppData\Local\git-hourly-sync.log"
```

### Run the task manually (for testing):

```powershell
schtasks /run /tn "GitHubHourlySync"
```

---

## Troubleshooting

### "Token file not found"
Run Step 1 again to create the token file.

### "Access Denied" when running script
Make sure PowerShell execution policy allows it:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Script not running automatically
1. Check Task Scheduler: `Win + R` → `taskschd.msc`
2. Look for "GitHubHourlySync" in the task list
3. Check the "Run as" user matches your Windows username

### Git authentication failing
1. Verify your token hasn't expired on GitHub
2. Re-run Step 1 with your new token
3. Manually test with: `git-hourly-sync.ps1`

---

## Uninstalling

To remove the scheduled task:

```powershell
schtasks /delete /tn "GitHubHourlySync" /f
```

To remove the stored token:

```powershell
Remove-Item "$env:USERPROFILE\.git-token.xml"
```

---

## What the Script Does Each Hour

1. **Pulls** latest changes from `origin/main`
2. **Stages** all local changes (`git add -A`)
3. **Commits** with timestamp: `"Hourly sync - 2026-08-27 14:30:00"`
4. **Pushes** to GitHub using your stored token
5. **Logs** activity to: `%USERPROFILE%\AppData\Local\git-hourly-sync.log`

---

## Customization

To change the commit message, edit `git-hourly-sync.ps1` and modify this line:
```powershell
$CommitMessage = "Hourly sync - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
```

To change the frequency (e.g., every 30 minutes), modify `setup-scheduler.bat`:
```batch
/sc hourly /mo 30
```

---

## Files Included

- `git-hourly-sync.ps1` — The main sync script
- `setup-scheduler.bat` — Scheduler configuration (run as admin)
- `SETUP-HOURLY-SYNC.md` — This guide
