<#
.SYNOPSIS
    Store the Supabase database password so psql can use it, and set ECHO_DB_URL.

.DESCRIPTION
    Reads database/connection.txt for the project's connection details, prompts
    for the database password with a masked prompt, and hands it to
    pgpass_write.ps1, which writes it into psql's own credential file.

    The password is typed into a masked prompt, so it never appears on screen,
    in shell history, in the process list, or in any file in this repository.

    Run this once. After it, deploying needs no password at all:

        .\database\scripts\deploy.ps1

.EXAMPLE
    .\database\scripts\save_password.ps1
#>
param(
    [string]$ConfigFile
)

$ErrorActionPreference = 'Stop'

# Resolved from this script's own location, not the current directory, so it
# works no matter where the terminal happens to be sitting.
if (-not $ConfigFile) {
    $repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
    $ConfigFile = Join-Path $repoRoot 'database\connection.txt'
}
if (-not (Test-Path $ConfigFile)) {
    throw "Cannot find $ConfigFile. Fill it in first - it tells this script which project to store the password for."
}
Write-Host "Reading $ConfigFile" -ForegroundColor DarkGray

# --- read the connection details --------------------------------------------
$cfg = @{}
foreach ($line in Get-Content $ConfigFile) {
    if ($line -match '^\s*#') { continue }
    if ($line -match '^\s*([A-Z_]+)\s*=\s*(.+?)\s*$') { $cfg[$Matches[1]] = $Matches[2] }
}

$poolerHost = $cfg['DB_HOST']
$dbUser     = $cfg['DB_USER']
$port       = if ($cfg['DB_PORT']) { [int]$cfg['DB_PORT'] } else { 5432 }
$database   = if ($cfg['DB_NAME']) { $cfg['DB_NAME'] } else { 'postgres' }

foreach ($pair in @(@('DB_HOST', $poolerHost), @('DB_USER', $dbUser))) {
    if (-not $pair[1] -or $pair[1] -like '*<*') {
        throw "$($pair[0]) is not filled in yet in $ConfigFile."
    }
}

Write-Host "Storing the database password for:" -ForegroundColor Cyan
Write-Host "  $dbUser@${poolerHost}:$port/$database"
Write-Host ""
Write-Host "This is the DATABASE password (Supabase -> Project Settings -> Database)," -ForegroundColor DarkGray
Write-Host "not an API key. Nothing is echoed as you type." -ForegroundColor DarkGray
Write-Host ""

$secure = Read-Host -Prompt "Password" -AsSecureString

# --- hand it to the writer ---------------------------------------------------
$writer = Join-Path $PSScriptRoot 'pgpass_write.ps1'
if (-not (Test-Path $writer)) { throw "Cannot find $writer" }

$result = & $writer -DbHost $poolerHost -DbUser $dbUser -Port $port `
                    -Database $database -SecurePassword $secure

# --- set ECHO_DB_URL, without the password in it -----------------------------
$url = "postgresql://${dbUser}@${poolerHost}:${port}/${database}?sslmode=require"
[Environment]::SetEnvironmentVariable('ECHO_DB_URL', $url, 'User')
$env:ECHO_DB_URL = $url

Write-Host ""
Write-Host "Password stored in $($result.Path)" -ForegroundColor Green
Write-Host "ECHO_DB_URL set for your account (no password in it):" -ForegroundColor Green
Write-Host "  $url" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Now run:  .\database\scripts\deploy.ps1" -ForegroundColor Cyan
