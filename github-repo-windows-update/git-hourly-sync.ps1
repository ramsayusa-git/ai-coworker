# Hourly Git Sync Script - Zero User Interaction
# Completely automated: pull, commit, push with no prompts

param(
    [string]$RepoPath = "D:\ai-workspace"
)

$ProgressPreference = 'SilentlyContinue'
$VerbosePreference = 'SilentlyContinue'
$ErrorActionPreference = 'Continue'

$LogFile = "$env:USERPROFILE\AppData\Local\git-hourly-sync.log"

function Log {
    param([string]$Message)
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    "$timestamp - $Message" | Add-Content -Path $LogFile -ErrorAction SilentlyContinue
}

function EnsureLogDir {
    $logDir = Split-Path $LogFile
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
}

EnsureLogDir

$tokenPath = "$env:USERPROFILE\.git-token.xml"
if (-not (Test-Path $tokenPath)) {
    Log "ERROR: Token file not found"
    exit 1
}

try {
    $credential = Import-Clixml -Path $tokenPath -ErrorAction Stop
    $token = $credential.GetNetworkCredential().Password
    if (-not $token) {
        Log "ERROR: Failed to extract token"
        exit 1
    }
} catch {
    Log "ERROR: Failed to load token"
    exit 1
}

if (-not (Test-Path $RepoPath)) {
    Log "ERROR: Repository path not found"
    exit 1
}

Push-Location $RepoPath -ErrorAction Stop

try {
    $env:GIT_TRACE = 0
    $env:GIT_TERMINAL_PROMPT = 0

    Log "Starting sync"

    $currentBranch = git rev-parse --abbrev-ref HEAD 2>$null
    if (-not $currentBranch) {
        Log "ERROR: Could not determine branch"
        exit 1
    }

    git pull origin $currentBranch --quiet 2>$null

    # Add all changes including new folders and submodules
    git add -A 2>$null
    git add -u 2>$null

    # Handle submodules
    git submodule update --init --recursive 2>$null

    $statusOutput = git status --porcelain 2>$null
    if ($statusOutput) {
        $commitMsg = "Hourly sync - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        git commit -m $commitMsg --no-edit --quiet 2>$null

        if ($LASTEXITCODE -eq 0) {
            $remoteUrl = "https://$token@github.com/ramsayusa-git/ai-coworker.git"
            git push $remoteUrl $currentBranch --quiet 2>$null

            if ($LASTEXITCODE -eq 0) {
                Log "SUCCESS: Sync complete"
            } else {
                Log "ERROR: Push failed"
                exit 1
            }
        } else {
            Log "ERROR: Commit failed"
            exit 1
        }
    } else {
        Log "INFO: No changes to commit"
    }

} catch {
    Log "ERROR: Exception occurred"
    exit 1
} finally {
    Pop-Location -ErrorAction SilentlyContinue
    Remove-Variable token -ErrorAction SilentlyContinue
    Remove-Variable credential -ErrorAction SilentlyContinue
}
