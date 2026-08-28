# 🚀 Full Workspace Hourly Sync Setup

Your entire **D:\ai-workspace** folder is now configured to automatically sync to GitHub every hour, including:
- All existing subfolders ✓
- All new folders created in the future ✓
- All file changes ✓

---

## ✅ What's Already Done

1. ✓ Git repository initialized at `D:\ai-workspace`
2. ✓ GitHub remote configured: `https://github.com/ramsayusa-git/ai-coworker.git`
3. ✓ `.gitignore` created (ignores node_modules, build artifacts, logs, etc.)
4. ✓ Initial commit made
5. ✓ Hourly sync script ready: `github-repo-windows-update/git-hourly-sync.ps1`

---

## 📋 Final Setup Steps (2 Steps Only)

### **Step 1: Store Your GitHub Token** 

Open **PowerShell as Administrator** and run:

```powershell
$token = "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"
$credential = New-Object System.Management.Automation.PSCredential("git", (ConvertTo-SecureString $token -AsPlainText -Force))
$credential | Export-Clixml -Path "$env:USERPROFILE\.git-token.xml"
Write-Host "✓ Token stored securely"
```

### **Step 2: Push Initial Commit & Set Up Scheduler**

```powershell
# First, push initial commit to GitHub
cd D:\ai-workspace

# Use the stored token to push
$tokenPath = "$env:USERPROFILE\.git-token.xml"
$credential = Import-Clixml -Path $tokenPath
$token = $credential.GetNetworkCredential().Password
$remoteUrl = "https://git:${token}@github.com/ramsayusa-git/ai-coworker.git"

git push $remoteUrl -u master

Write-Host "✓ Initial commit pushed to GitHub"
```

Then **right-click** `github-repo-windows-update/setup-scheduler.bat` and select **"Run as administrator"**.

---

## 📊 What Gets Synced Each Hour

Every hour at the top of the hour, the script:

1. **Pulls** latest changes from GitHub (if working from multiple machines)
2. **Stages** all changes in D:\ai-workspace and subfolders
3. **Commits** with automatic timestamp: `"Hourly sync - 2026-08-27 14:30:00"`
4. **Pushes** to `https://github.com/ramsayusa-git/ai-coworker.git`

---

## 📁 What's Included in Sync

✓ All files in D:\ai-workspace  
✓ All existing subfolders  
✓ New subfolders created after setup  
✓ New files in existing/new folders  

---

## ⚙️ Configuration

### File Locations

| Purpose | Path |
|---------|------|
| Main git repo | `D:\ai-workspace/.git` |
| Sync script | `D:\ai-workspace/github-repo-windows-update/git-hourly-sync.ps1` |
| Scheduler setup | `D:\ai-workspace/github-repo-windows-update/setup-scheduler.bat` |
| Sync logs | `%USERPROFILE%\AppData\Local\git-hourly-sync.log` |
| Stored token | `%USERPROFILE%\.git-token.xml` (encrypted) |
| Ignore rules | `D:\ai-workspace/.gitignore` |

### Excluded from Sync (by .gitignore)

- `node_modules/` - npm packages
- `__pycache__/` - Python cache
- `.env` files - sensitive configs
- Build artifacts (`dist/`, `build/`, `target/`)
- IDE files (`.vscode/`, `.idea/`)
- OS files (`Thumbs.db`, `.DS_Store`)
- Large files (`*.iso`, `*.zip`)

---

## 🔍 Verification

### Check if everything is set up:

```powershell
# Show git status
cd D:\ai-workspace
git status

# Show remote
git remote -v

# Show last commit
git log -1 --oneline
```

### View sync history:

```powershell
type "$env:USERPROFILE\AppData\Local\git-hourly-sync.log"
```

### Test the sync script manually:

```powershell
D:\ai-workspace\github-repo-windows-update\git-hourly-sync.ps1
```

---

## 🛠️ Troubleshooting

### "fatal: not a git repository"
The .git folder may have been deleted. Reinitialize:
```powershell
cd D:\ai-workspace
git init
git remote add origin https://github.com/ramsayusa-git/ai-coworker.git
```

### Token expired or invalid
1. Generate a new token on GitHub (Settings → Developer settings → Personal access tokens)
2. Re-run Step 1 above with the new token
3. Manually run the sync script to test

### Scheduled task not running
1. Open Task Scheduler: `Win + R` → `taskschd.msc`
2. Find "GitHubHourlySync" and check:
   - Status: `Ready`
   - Last Result: `0` (success)
   - Run as: Your Windows username
3. Right-click → `Run` to test manually

### "Access Denied" errors
Make sure you're running as Administrator and that:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
```

---

## 🔒 Security Notes

✓ GitHub token stored **encrypted** in Windows (not in scripts)  
✓ `.gitignore` prevents secrets from being committed  
✓ Logs don't contain sensitive tokens  
✓ Script removes token from memory after each run  

---

## 📝 Tips

### Adding files manually
New files are automatically picked up by the hourly sync. No action needed.

### Excluding specific files
Edit `D:\ai-workspace/.gitignore`:
```
# Add patterns here
some-folder/
*.bak
temp-*.txt
```

### Changing sync frequency
Edit `github-repo-windows-update/setup-scheduler.bat`:
- Change `hourly /mo 1` to other values:
  - `/mo 30` = every 30 minutes
  - `/mo 12` = every 12 hours
  - `/sc daily` = once per day

### Changing commit message
Edit `github-repo-windows-update/git-hourly-sync.ps1`:
```powershell
$CommitMessage = "Custom message - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
```

---

## ❌ Uninstalling

To stop syncing:

```powershell
# Stop the scheduled task
schtasks /delete /tn "GitHubHourlySync" /f

# Remove the stored token
Remove-Item "$env:USERPROFILE\.git-token.xml" -Force
```

The git repository will remain. You can still commit/push manually anytime.

---

## 📞 Need Help?

Check the logs:
```powershell
tail -f "$env:USERPROFILE\AppData\Local\git-hourly-sync.log"
```

Verify Git is working:
```powershell
cd D:\ai-workspace
git log --oneline
git status
```

Test authentication:
```powershell
$tokenPath = "$env:USERPROFILE\.git-token.xml"
$credential = Import-Clixml -Path $tokenPath
$token = $credential.GetNetworkCredential().Password
Write-Host "Token loaded: $($token.Substring(0,10))..." 
```
