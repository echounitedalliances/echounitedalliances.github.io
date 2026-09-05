<#
.SYNOPSIS
    Deploy the Echo United Alliances database to Supabase with psql.

.DESCRIPTION
    Runs every SQL file in order against the connection string you pass. Must
    be run from the repository root, because 02_load_from_csv.sql reads
    database/csv/*.csv by relative path.

    The data load is ~4.4 million rows and takes a few minutes over the
    network. Everything is re-runnable: 02 truncates before it loads.

.EXAMPLE
    # after filling in database/connection.txt and running save_password.ps1
    .\database\scripts\deploy.ps1

.EXAMPLE
    # schema and views only, no data reload
    .\database\scripts\deploy.ps1 -SkipData
#>
param(
    # Optional. Left out, it is built from database/connection.txt, and the
    # password comes from psql's credential store via save_password.ps1.
    [string]$ConnectionString,

    # skip the CSV load (schema, views and logic only)
    [switch]$SkipData,

    # skip the real-world airport names, coordinates and timezones
    [switch]$SkipAirportBackfill
)

$ErrorActionPreference = 'Stop'

# psql writes NOTICE lines to stderr, and Windows PowerShell turns any stderr
# from a native command into a NativeCommandError - which, under
# ErrorActionPreference = Stop, aborts the whole deploy over
# 'extension "pg_trgm" already exists, skipping'. Silencing notices at the
# server keeps genuine errors visible and harmless chatter off stderr.
$env:PGOPTIONS = '--client-min-messages=warning'

# --- work out where to connect ----------------------------------------------
if (-not $ConnectionString) {
    $cfgPath = 'database/connection.txt'
    if (-not (Test-Path $cfgPath)) {
        throw "No -ConnectionString given and $cfgPath does not exist. Fill that file in, then run save_password.ps1."
    }
    $cfg = @{}
    foreach ($line in Get-Content $cfgPath) {
        if ($line -match '^\s*#') { continue }
        if ($line -match '^\s*([A-Z_]+)\s*=\s*(.+?)\s*$') { $cfg[$Matches[1]] = $Matches[2] }
    }
    foreach ($k in 'DB_USER', 'DB_HOST') {
        if (-not $cfg[$k] -or $cfg[$k] -like '*<*') {
            throw "$k is still a placeholder in $cfgPath."
        }
    }
    $p = if ($cfg['DB_PORT']) { $cfg['DB_PORT'] } else { '5432' }
    $d = if ($cfg['DB_NAME']) { $cfg['DB_NAME'] } else { 'postgres' }
    $ConnectionString = "postgresql://$($cfg['DB_USER'])@$($cfg['DB_HOST']):$p/$d`?sslmode=require"
    Write-Host "Connecting as $($cfg['DB_USER']) to $($cfg['DB_HOST'])" -ForegroundColor DarkGray
}

# The EDB installer does not put psql on PATH, and a terminal opened before the
# install keeps the old PATH regardless. Fall back to the standard locations.
$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) {
    $psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe',
                          'C:\Program Files (x86)\PostgreSQL\*\bin\psql.exe' `
            -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1 -ExpandProperty FullName
}
if (-not $psql) {
    throw "psql not found. Install it with: winget install PostgreSQL.PostgreSQL.17 (tick only Command Line Tools)."
}

if (-not (Test-Path 'database/sql/01_schema.sql')) {
    throw "Run this from the repository root: the CSV paths in 02_load_from_csv.sql are relative."
}

$files = @('01_schema.sql')
if (-not $SkipData)             { $files += '02_load_from_csv.sql' }
if (-not $SkipAirportBackfill)  { $files += '03_airports_backfill.sql' }
$files += @('04_views.sql', '05_reservations.sql', '06_inventory.sql',
            '07_connections.sql', '08_rls_policies.sql', '09_site_api.sql',
            '10_booking_api.sql', '11_profiles_admin.sql', '12_countries.sql',
            '13_admin_grants.sql', '14_supabase.sql', '15_board.sql')

# 09_site_api indexes the directory and typeahead with trigram GIN indexes.
Write-Host ""
Write-Host "==> extensions" -ForegroundColor Cyan
& $psql $ConnectionString -v ON_ERROR_STOP=1 -q -c "create extension if not exists pg_trgm;"
if ($LASTEXITCODE -ne 0) { throw "could not create pg_trgm" }

foreach ($f in $files) {
    $path = "database/sql/$f"
    if (-not (Test-Path $path)) { throw "missing $path" }
    Write-Host ""
    Write-Host "==> $f" -ForegroundColor Cyan
    $started = Get-Date
    # statement_timeout is set per role on Supabase and the data load blows
    # straight through it: COPY of 153k aircraft rows over the network was
    # cancelled mid-file. Lifting it for this session only, before each file.
    & $psql $ConnectionString -v ON_ERROR_STOP=1 -q `
        -c "set statement_timeout = 0" `
        -c "set idle_in_transaction_session_timeout = 0" `
        -c "set client_min_messages = warning" `
        -f $path
    if ($LASTEXITCODE -ne 0) {
        throw "$f failed with exit code $LASTEXITCODE"
    }
    $secs = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
    Write-Host "    ok (${secs}s)" -ForegroundColor Green
}

# The search path is materialised; it must be rebuilt after any data reload.
Write-Host ""
Write-Host "==> refreshing the search materialisations" -ForegroundColor Cyan
& $psql $ConnectionString -v ON_ERROR_STOP=1 -q `
    -c "set statement_timeout = 0" `
    -c "select public.echo_refresh_search();"
if ($LASTEXITCODE -ne 0) { throw "refresh failed" }
Write-Host "    ok" -ForegroundColor Green

Write-Host ""
Write-Host "==> row counts" -ForegroundColor Cyan
& $psql $ConnectionString -q -c @"
select 'airlines' as t, count(*) from public.airlines
union all select 'airports', count(*) from public.airports
union all select 'aircraft', count(*) from public.aircraft
union all select 'flights',  count(*) from public.flights
union all select 'assignments', count(*) from public.flight_assignments
union all select 'leg_departures', count(*) from public.mv_leg_departures
order by t;
"@

Write-Host ""
Write-Host "Deployed." -ForegroundColor Green
Write-Host "Try it:  select * from public.search_itineraries('SGN','LIM',current_date+7,'ECONOMY',1,1,10);"
