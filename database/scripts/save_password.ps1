<#
.SYNOPSIS
    Store the Supabase database password so psql can use it, and set ECHO_DB_URL.

.DESCRIPTION
    Reads database/connection.txt for the project's connection details, prompts
    for the database password with a masked prompt, and hands it to
    pgpass_write.ps1, which writes it into Echo's OWN credential file:

        %APPDATA%\postgresql\echo-united-alliances.pgpass

    Not psql's shared pgpass.conf. Another project's tool rewrote that file on
    16 September 2026 and broke Echo's password without touching this
    repository -- see echo_credentials.ps1. Every Echo script now points psql
    at the separate file for its own process only.

    It then connects once with the saved password, so a mistyped password
    fails here, where you can see it, rather than halfway through a deploy.

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

. (Join-Path $PSScriptRoot 'echo_credentials.ps1')

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
                    -Database $database -SecurePassword $secure `
                    -PgpassPath $EchoPgpassPath

# --- set ECHO_DB_URL, without the password in it -----------------------------
$url = "postgresql://${dbUser}@${poolerHost}:${port}/${database}?sslmode=require"
[Environment]::SetEnvironmentVariable('ECHO_DB_URL', $url, 'User')
$env:ECHO_DB_URL = $url

# --- prove it works ----------------------------------------------------------
# -w: never prompt. If the password is wrong this fails now, with Supabase's
# own message, instead of at the next deploy.
$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) {
    $psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
            Select-Object -Last 1 -ExpandProperty FullName
}
Use-EchoCredentials
$verified = $false
if ($psql) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $probe = & $psql -w "postgresql://${dbUser}@${poolerHost}:${port}/${database}?sslmode=require" `
                     -X -q -t -A -c "select 1" 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    if ($code -eq 0) {
        $verified = $true
    } else {
        Write-Host ""
        Write-Host "Saved, but Supabase REJECTED this password:" -ForegroundColor Red
        $probe | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        Write-Host "Check it under Supabase -> Project Settings -> Database, and run this again." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "psql not found, so the password could not be checked by connecting." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Password stored in $($result.Path)" -ForegroundColor Green
if ($verified) { Write-Host "Connected with it: the password works." -ForegroundColor Green }
Write-Host "ECHO_DB_URL set for your account (no password in it):" -ForegroundColor Green
Write-Host "  $url" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Now run:  .\database\scripts\deploy.ps1" -ForegroundColor Cyan
