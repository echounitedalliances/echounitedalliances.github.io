<#
.SYNOPSIS
    Check that every object the site depends on exists and answers.

.DESCRIPTION
    Run this after ANY change to database/sql. It exists because the failure
    it catches is silent.

    Several files drop matviews WITH CASCADE, and the cascade reaches forward
    into files numbered after them. Re-run one of those files on its own and
    Postgres quietly deletes objects defined later -- the departure board, the
    network map, the airport autocomplete -- and recreates none of them. There
    is no error. The build still succeeds, the deploy still publishes, and the
    features come back empty until a person notices and reports it.

    That has happened twice. This turns it into a failed check instead.

    It reads the connection the same way deploy.ps1 does and never handles a
    password: psql takes that from its own credential store.

.EXAMPLE
    ./database/scripts/verify.ps1
#>
[CmdletBinding()]
param(
    [string]$ConnectionString
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

# Relations the site reads, with the smallest row count that means "populated".
# A matview that exists but holds nothing is the same outage as a missing one.
$relations = @(
    @{ name = 'mv_leg_departures';       min = 100000 },
    @{ name = 'mv_route_adjacency';      min = 10000  },
    @{ name = 'mv_airport_connectivity'; min = 1000   },
    @{ name = 'mv_airport_directory';    min = 1000   },  # departure board, airports
    @{ name = 'mv_airline_directory';    min = 500    },
    @{ name = 'mv_network_arcs';         min = 500    },  # network map
    @{ name = 'mv_network_nodes';        min = 100    },  # network map
    @{ name = 'mv_division_arcs';        min = 1000   },
    @{ name = 'v_airline_profile';       min = 500    },
    @{ name = 'v_division_summary';      min = 8      },
    @{ name = 'v_route_pairs';           min = 1000   },
    @{ name = 'v_airline_directory_live'; min = 500  }   # admin name/blurb overrides
)

# One representative call per RPC the site makes, and the least it may return.
$calls = @(
    @{ name = 'board_departures';   sql = "select count(*) from public.board_departures('SGN', 8, 'UTC', now())"; min = 1 },
    @{ name = 'search_airports';    sql = "select count(*) from public.search_airports('lon', 5)";                min = 1 },
    @{ name = 'search_places';      sql = "select count(*) from public.search_places('paris', 5)";                min = 1 },
    @{ name = 'search_airlines';    sql = "select count(*) from public.search_airlines(null, null, null, 5, 0)";  min = 1 },
    @{ name = 'division_arcs';      sql = "select count(*) from public.division_arcs('kyra', 50)";                min = 1 },
    @{ name = 'airline_countries';  sql = "select count(*) from public.airline_countries(null, null)";            min = 1 },
    @{ name = 'search_itineraries'; sql = "select count(*) from public.search_itineraries('SGN','SIN', current_date + 7, 'ECONOMY', 1, 0, 60)"; min = 1 },
    @{ name = 'fare_calendar';      sql = "select count(*) from public.fare_calendar('SGN','SIN', current_date + 7, 3, 'ECONOMY', 1)"; min = 1 },
    @{ name = 'rtw_quote';          sql = "select count(*) from public.rtw_quote(array['LHR','DXB','SIN','SYD','LAX'], 'ECONOMY')"; min = 1 }
)

# Returns the last line psql printed, or $null if the query failed at all.
#
# The stderr handling is not incidental. This script runs with
# $ErrorActionPreference = 'Stop', and Windows PowerShell turns a native
# executable's stderr into a NativeCommandError record -- so `2>&1` made a
# refusal from psql terminate the whole run. That was harmless while every
# check here expected success; the "locked down" checks below expect psql to
# refuse, which is the point of them. Sending stderr to a file, with Continue
# in scope, lets a failed query be an answer rather than the end of the run.
function Invoke-Scalar([string]$sql) {
    $ErrorActionPreference = 'Continue'
    $errFile = [System.IO.Path]::GetTempFileName()
    try {
        $out = & $psql $ConnectionString -t -A -c $sql 2>$errFile
        if ($LASTEXITCODE -ne 0) { return $null }
        if ($null -eq $out) { return $null }
        return ($out | Select-Object -Last 1).Trim()
    } finally {
        Remove-Item $errFile -Force -ErrorAction SilentlyContinue
    }
}

$failures = New-Object System.Collections.Generic.List[string]

Write-Output "relations"
foreach ($r in $relations) {
    $n = Invoke-Scalar "select count(*) from public.$($r.name)"
    if ($null -eq $n) {
        Write-Output ("  MISSING  {0}" -f $r.name)
        $failures.Add("$($r.name) is missing or unreadable")
    } elseif ([int64]$n -lt $r.min) {
        Write-Output ("  EMPTY    {0}  {1} rows, expected at least {2}" -f $r.name, $n, $r.min)
        $failures.Add("$($r.name) holds $n rows, expected at least $($r.min)")
    } else {
        Write-Output ("  ok       {0}  {1}" -f $r.name, $n)
    }
}

Write-Output "rpcs"
foreach ($c in $calls) {
    $n = Invoke-Scalar $c.sql
    if ($null -eq $n) {
        Write-Output ("  FAILED   {0}" -f $c.name)
        $failures.Add("$($c.name) did not run")
    } elseif ([int64]$n -lt $c.min) {
        Write-Output ("  EMPTY    {0}  returned {1}" -f $c.name, $n)
        $failures.Add("$($c.name) returned $n rows")
    } else {
        Write-Output ("  ok       {0}  {1}" -f $c.name, $n)
    }
}

# As the ANON role, which is what a visitor actually is.
#
# Everything above runs as the owner, who can read anything -- so a missing
# GRANT, or a security_invoker view over a table the public cannot read, sails
# straight through it. That exact mistake returned 401 "No such carrier" on
# every carrier page while the owner's own checks were all green.
Write-Output "as a visitor"
foreach ($v in @(
    @{ name = 'v_airline_profile';        sql = "select count(*) from public.v_airline_profile" },
    @{ name = 'v_airline_directory_live'; sql = "select count(*) from public.v_airline_directory_live" },
    @{ name = 'search_airlines';          sql = "select count(*) from public.search_airlines(null,null,null,5,0)" },
    @{ name = 'mv_network_arcs';          sql = "select count(*) from public.mv_network_arcs" },
    @{ name = 'mv_airport_directory';     sql = "select count(*) from public.mv_airport_directory" }
)) {
    # No RESET: each psql call is its own session, and the last line of
    # output has to be the count rather than the word RESET.
    $n = Invoke-Scalar ("set role anon; " + $v.sql)
    if ($null -eq $n -or [int64]$n -lt 1) {
        Write-Output ("  DENIED   {0}" -f $v.name)
        $failures.Add("anon cannot read $($v.name) -- check GRANT and security_invoker")
    } else {
        Write-Output ("  ok       {0}  {1}" -f $v.name, $n)
    }
}

# Locked down -- the opposite assertion to the one above. These must NOT
# answer, and a green tick here means somebody was correctly turned away.
#
# Worth its own section because PostgreSQL grants EXECUTE on every new
# function to PUBLIC, and every role is a member of PUBLIC. So a rewrite of
# 28_admin_applications.sql that loses the REVOKE hands the admin queue --
# which is every applicant's email address -- to anyone holding the publishable
# key, and not one check above this line would go red.
Write-Output "locked down"
foreach ($d in @(
    @{ name = 'admin_applications, as a visitor'; sql = "set role anon; select count(*) from public.admin_applications" },
    @{ name = 'the queue, as a visitor';          sql = "set role anon; select count(*) from public.admin_applications_list('all')" },
    @{ name = 'the queue, signed in but not admin'; sql = "set role authenticated; select count(*) from public.admin_applications_list('all')" },
    @{ name = 'moving a carrier, signed in but not admin'; sql = "set role authenticated; select count(*) from public.admin_move_airline('00000000-0000-0000-0000-000000000000'::uuid, 'kyra')" },
    @{ name = 'the network rebuild, signed in';           sql = "set role authenticated; select public.echo_refresh_division_network()" }
)) {
    $n = Invoke-Scalar $d.sql
    if ($null -ne $n) {
        Write-Output ("  OPEN     {0}  answered with {1}" -f $d.name, $n)
        $failures.Add("$($d.name): readable without being an admin")
    } else {
        Write-Output ("  ok       {0}  refused" -f $d.name)
    }
}

# And the grants themselves, rather than only the behaviour: this catches a
# lost REVOKE on the write paths, which cannot be probed safely by calling them.
$anonExec = Invoke-Scalar @"
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('apply_for_admin','my_admin_application','record_admin_application',
                     'admin_applications_list','decide_admin_application',
                     'admin_move_airline','admin_update_airline','echo_refresh_division_network')
   and has_function_privilege('anon', p.oid, 'execute')
"@
if ($null -eq $anonExec -or [int64]$anonExec -ne 0) {
    Write-Output ("  OPEN     anon may execute {0} of the admin functions" -f $anonExec)
    $failures.Add("anon holds EXECUTE on $anonExec admin functions; expected 0")
} else {
    Write-Output "  ok       anon may execute none of the admin functions"
}

# Every published carrier must resolve on its own page. This is the check that
# would have caught the "No such carrier" outage.
$published = Invoke-Scalar "select count(*) from public.airlines where is_published"
$profiles  = Invoke-Scalar "select count(*) from public.v_airline_profile"
if ($published -ne $profiles) {
    Write-Output ("  MISMATCH carriers {0} but profiles {1}" -f $published, $profiles)
    $failures.Add("$published published carriers but $profiles resolve a profile")
} else {
    Write-Output ("  ok       every one of {0} carriers resolves a profile" -f $published)
}

Write-Output ""
if ($failures.Count -gt 0) {
    Write-Output "FAILED"
    foreach ($f in $failures) { Write-Output "  - $f" }
    Write-Output ""
    Write-Output "If you just re-ran one SQL file, that is almost certainly why:"
    Write-Output "re-run it and every file after it, in order, then verify again."
    exit 1
}

Write-Output "everything the site reads is present and answering."
