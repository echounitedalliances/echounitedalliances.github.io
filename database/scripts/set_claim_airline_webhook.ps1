<#
.SYNOPSIS
    Store the airline-claim Discord webhook in Supabase Vault, where the
    database sends new-claim notices from (54_airline_claims.sql).

.DESCRIPTION
    The URL is read from CLAIM_AIRLINE_WEBHOOK_URL in web/.env.local, which
    is gitignored, and is never printed. Run it again after regenerating
    the webhook in Discord: it replaces the stored one.

        .\database\scripts\set_claim_airline_webhook.ps1

    Deliberately NOT prefixed VITE_: Vite compiles VITE_ variables into the
    public bundle, which is how the admin-apply webhook leaked before it
    moved into the database (see 41_admin_apply_notice.sql).
#>
$ErrorActionPreference = 'Stop'
$env:PGOPTIONS = '--client-min-messages=warning'

$envPath = 'web/.env.local'
$url = $null
if (Test-Path $envPath) {
    foreach ($line in Get-Content $envPath) {
        if ($line -match '^\s*CLAIM_AIRLINE_WEBHOOK_URL\s*=\s*(.+?)\s*$') { $url = $Matches[1] }
    }
}
if (-not $url -or $url -notmatch '^https://(discord\.com|discordapp\.com)/api/webhooks/') {
    throw "Put CLAIM_AIRLINE_WEBHOOK_URL=https://discord.com/api/webhooks/... in $envPath first."
}

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

# The URL goes in as a psql variable on stdin, so it is on no command line.
$sql = @"
\set ON_ERROR_STOP on
\set url '$($url -replace "'", "''")'
select case
         when exists (select 1 from vault.secrets where name = 'claim_airline_webhook')
         then (select vault.update_secret(id, :'url') from vault.secrets where name = 'claim_airline_webhook')::text
         else vault.create_secret(:'url', 'claim_airline_webhook', 'Discord webhook for new airline claims')::text
       end is not null as stored;
"@
$sql | & $psql $conn -X -q -At
if ($LASTEXITCODE -ne 0) { throw 'Storing the webhook failed.' }
Write-Host 'Webhook stored in Vault as claim_airline_webhook.' -ForegroundColor Green
