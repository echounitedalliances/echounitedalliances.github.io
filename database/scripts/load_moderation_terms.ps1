<#
.SYNOPSIS
    Load the word filter's terms (66_description_moderation.sql) from
    database/moderation/terms.csv into public.moderation_terms.

.DESCRIPTION
    terms.csv is git-ignored: the repository is public, and a list of slurs
    does not belong on it. Columns: term,kind,category, where kind is word,
    contains or regex and category is slur, profanity, attack, alliance,
    hate, politics, spam or other. Lines starting with # are skipped.

    Adds new terms and updates changed ones. It never removes a term, so
    anything admins added from the dashboard stays. Remove terms there.

        .\database\scripts\load_moderation_terms.ps1
#>
$ErrorActionPreference = 'Stop'
$env:PGOPTIONS = '--client-min-messages=warning'

$csv = 'database/moderation/terms.csv'
if (-not (Test-Path $csv)) { throw "No $csv to load." }

$cfg = @{}
foreach ($line in Get-Content 'database/connection.txt') {
    if ($line -match '^\s*#') { continue }
    if ($line -match '^\s*([A-Z_]+)\s*=\s*(.+?)\s*$') { $cfg[$Matches[1]] = $Matches[2] }
}
$p = if ($cfg['DB_PORT']) { $cfg['DB_PORT'] } else { '5432' }
$d = if ($cfg['DB_NAME']) { $cfg['DB_NAME'] } else { 'postgres' }
$conn = "postgresql://$($cfg['DB_USER'])@$($cfg['DB_HOST']):$p/$d`?sslmode=require"

$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) {
    $psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
. (Join-Path $PSScriptRoot 'echo_credentials.ps1')
Use-EchoCredentials

# Comments out, header kept, written where psql's \copy can read it.
$clean = Join-Path $env:TEMP 'echo-moderation-terms.csv'
Get-Content $csv -Encoding UTF8 | Where-Object { $_ -notmatch '^\s*#' -and $_.Trim() } |
    Set-Content $clean -Encoding utf8
$path = (Resolve-Path $clean).Path -replace '\\', '/'

$sql = @"
\set ON_ERROR_STOP on
begin;
create temp table t (term text, kind text, category text) on commit drop;
\copy t from '$path' with (format csv, header true, encoding 'UTF8')
insert into public.moderation_terms (term, kind, category, added_by)
select case when kind = 'regex' then btrim(term) else lower(btrim(term)) end, kind, category, 'terms.csv'
  from t where btrim(coalesce(term, '')) <> ''
on conflict (term) do update set kind = excluded.kind, category = excluded.category;
select count(*) || ' terms in the filter' from public.moderation_terms;
commit;
"@
$sql | & $psql $conn -X -q -At
$code = $LASTEXITCODE
Remove-Item $clean -ErrorAction SilentlyContinue
if ($code -ne 0) { throw 'Loading the terms failed.' }
