# Hourly Git Sync Script
# Pulls latest, commits changes, pushes to remote

param(
    [string]$RepoPath = "D:\ai-workspace",
    [string]$CommitMessage = "Hourly sync - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

# Load credentials from secure storage
$tokenPath = "$env:USERPROFILE\.git-token.xml"
if (-not (Test-Path $tokenPath)) {
    Write-Error "Token file not found at $tokenPath. Run setup first."
    exit 1
}

try {
    $credential = Import-Clixml -Path $tokenPath
    $token = $credential.GetNetworkCredential().Password
} catch {
    Write-Error "Failed to load token: $_"
    exit 1
}

# Change to repo directory
Push-Location $RepoPath

try {
    # Configure git with token for this operation
    $env:GIT_TRACE = 0  # Silence debug output

    # Pull latest changes
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Pulling latest changes..."
    git pull origin main --quiet 2>&1 | Out-Null

    # Stage all changes
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Staging changes..."
    git add -A

    # Check if there are changes to commit
    $status = git status --porcelain
    if ($status) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Committing changes..."
        git commit -m $CommitMessage --quiet

        # Push to remote using token
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Pushing to remote..."
        $remoteUrl = "https://git:${token}@github.com/ramsayusa-git/ai-coworker.git"
        git push $remoteUrl main --quiet

        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✓ Sync complete"
    } else {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] No changes to commit"
    }
} catch {
    Write-Error "Git operation failed: $_"
    exit 1
} finally {
    Pop-Location
    # Clear sensitive data
    Remove-Variable token -ErrorAction SilentlyContinue
}
