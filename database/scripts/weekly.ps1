<#
.SYNOPSIS
    The weekly scrape: every Echo division, merged into the live database
    without touching an account, a booking or a member-site button.

.DESCRIPTION
    Run from the repository root after putting a fresh token from the app into
    divisions/.token. The token lasts about an hour; the whole run takes about
    fifteen minutes, most of it the database.

    What it does, and why each step is there -- every one of these was a real
    failure on 16 September 2026:

      1. Moves last week's airline folders aside, into divisions/.previous/.
         build_database.py loads EVERY folder it finds, so an airline that
         left or renamed itself would otherwise be loaded again as a member.

      2. Scrapes all eight divisions from the live rosters, with --force so
         existing airlines' new flights are fetched rather than kept.

      3. Retries, without --force, whatever the game's server refused. It
         answered 503 to 7 of 583 airlines under load; a second, gentler pass
         filled every one.

      4. Proves the scrape complete (divisions/check_scrape.py) and STOPS if it
         is not. Nothing below runs on a partial scrape.

      5. Builds the CSVs. Carrier codes are sticky: an airline keeps its code
         unless the player changed their in-game one.

      6. Resolves any new airport against the cached open datasets
         (backfill_airports.py --rebuild), so nothing already loaded moves.

      7. Stages, merges and refreshes (database/weekly/1..3). The merge is one
         transaction and refuses a scrape that looks partial; the refresh
         follows immediately, because until it has run the site is reading
         last week's views over this week's tables.

      8. Writes the new carrier count into web/index.html, the one place the
         figure cannot be read live: it is what a link preview shows.

      9. Verifies everything the site reads.

    It never runs database/sql/02_load_from_csv.sql. That truncates with
    CASCADE and would empty every account and booking.

.EXAMPLE
    .\database\scripts\weekly.ps1

.EXAMPLE
    # the scrape finished but the load failed: load what is on disk again
    .\database\scripts\weekly.ps1 -SkipScrape
#>
[CmdletBinding()]
param(
    [string]$ConnectionString,
    [switch]$SkipScrape
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path 'database/sql/01_schema.sql')) {
    throw "Run this from the repository root."
}

if (-not $ConnectionString) {
    $cfg = @{}
    foreach ($line in Get-Content 'database/connection.txt') {
        if ($line -match '^\s*#') { continue }
        if ($line -match '^\s*([A-Z_]+)\s*=\s*(.+?)\s*$') { $cfg[$Matches[1]] = $Matches[2] }
    }
    $ConnectionString = "host=$($cfg['DB_HOST']) port=$($cfg['DB_PORT']) dbname=$($cfg['DB_NAME']) user=$($cfg['DB_USER']) sslmode=require"
}

$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) {
    $psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
            Select-Object -Last 1 -ExpandProperty FullName
}
if (-not $psql) { throw "psql not found." }

$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) { throw "python not found." }

$env:PGCLIENTENCODING = 'UTF8'
$env:PYTHONIOENCODING = 'utf-8'

$divisions = @('aegis', 'aura', 'elion', 'elysium', 'kyra', 'proxima', 'rhea', 'vilis')

# Windows PowerShell turns anything a native program writes to stderr into a
# terminating error under ErrorActionPreference Stop -- and the scraper writes
# its progress there, and psql its notices. So native calls run with Continue
# in scope and are judged on their exit code, which is what actually says
# whether they worked.
function Invoke-Native([string]$Label, [scriptblock]$Command) {
    Write-Host ""
    Write-Host "==> $Label" -ForegroundColor Cyan
    $started = Get-Date
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Command 2>&1 | ForEach-Object { Write-Host "    $_" }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    $secs = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
    if ($code -ne 0) {
        Write-Host "    FAILED (exit $code, ${secs}s)" -ForegroundColor Red
    } else {
        Write-Host "    ok (${secs}s)" -ForegroundColor Green
    }
    return $code
}

function Invoke-Sql([string]$Label, [string]$File) {
    $code = Invoke-Native $Label { & $psql $ConnectionString -X -q -v ON_ERROR_STOP=1 -f $File }
    if ($code -ne 0) { throw "$File failed. See above." }
}

# --------------------------------------------------------------------- scrape
if (-not $SkipScrape) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmm'
    Write-Host ""
    Write-Host "==> moving last week's airline folders to divisions/.previous/$stamp" -ForegroundColor Cyan
    foreach ($d in $divisions) {
        $members = "divisions/$d/members"
        if (-not (Test-Path $members)) { continue }
        $dest = "divisions/.previous/$stamp/$d"
        New-Item -ItemType Directory -Force $dest | Out-Null
        # Folders only: Proxima's members/ also holds a tracked file.
        Get-ChildItem $members -Directory | Move-Item -Destination $dest
        Copy-Item "divisions/$d/members.json" "divisions/.previous/$stamp/$d/members.json" -ErrorAction SilentlyContinue
    }
    Write-Host "    ok" -ForegroundColor Green

    foreach ($d in $divisions) {
        [void](Invoke-Native "scraping $d" { & $python divisions/scrape_members.py --division $d --force --workers 4 })
    }
    # Whatever the server refused the first time. Without --force this keeps
    # everything already fetched and only fills the gaps.
    foreach ($d in $divisions) {
        [void](Invoke-Native "filling gaps in $d" { & $python divisions/scrape_members.py --division $d --workers 2 })
    }
}

if ((Invoke-Native 'checking the scrape is complete' { & $python divisions/check_scrape.py }) -ne 0) {
    throw ("The scrape is incomplete, so nothing has been loaded. If the token expired, capture a " +
           "fresh one into divisions/.token and run again with -SkipScrape after re-scraping the " +
           "divisions named above, or run the whole thing again.")
}

# ----------------------------------------------------------------------- build
if ((Invoke-Native 'building the CSVs' { & $python database/scripts/build_database.py }) -ne 0) {
    throw "build_database.py failed."
}
if ((Invoke-Native 'resolving new airports' { & $python database/scripts/backfill_airports.py --rebuild }) -ne 0) {
    throw "backfill_airports.py failed."
}

# ------------------------------------------------------------------------ load
Invoke-Sql 'staging the scrape (nothing live changes)' 'database/weekly/1_stage.sql'
Invoke-Sql 'merging into the live tables'              'database/weekly/2_merge.sql'
Invoke-Sql 'rebuilding what the site reads'            'database/weekly/3_refresh.sql'

# ------------------------------------------------------------ link preview
$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$count = (& $psql $ConnectionString -X -t -A -q -c "select count(*) from public.mv_airline_directory" 2>$null | Select-Object -Last 1)
$ErrorActionPreference = $previous
if ("$count".Trim() -match '^\d+$') {
    $html = [IO.File]::ReadAllText((Resolve-Path 'web/index.html'))
    $updated = [regex]::Replace($html, 'Eight divisions\. \d+ airlines\. One network\.', "Eight divisions. $("$count".Trim()) airlines. One network.")
    if ($updated -ne $html) {
        [IO.File]::WriteAllText((Resolve-Path 'web/index.html'), $updated, (New-Object System.Text.UTF8Encoding $false))
        Write-Host ""
        Write-Host "==> web/index.html now says $("$count".Trim()) airlines" -ForegroundColor Cyan
    }
}

# ---------------------------------------------------------------------- verify
Write-Host ""
Write-Host "==> verifying everything the site reads" -ForegroundColor Cyan
& "$PSScriptRoot/verify.ps1" -ConnectionString $ConnectionString
if ($LASTEXITCODE -ne 0) { throw "The data is loaded but verification failed -- see above." }

Write-Host ""
Write-Host "Done. To publish the site with this week's figures:" -ForegroundColor Green
Write-Host "    npm --prefix web run publish"
Write-Host "    git add index.html 404.html assets web/index.html database/reference/carrier_codes.json"
Write-Host "    git commit -m 'Weekly scrape'   and push"
