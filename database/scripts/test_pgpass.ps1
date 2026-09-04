<#
.SYNOPSIS
    Self-test for pgpass_write.ps1. Runs against a scratch file, never touches
    the real credential store.

.DESCRIPTION
    This exists because the credential writer lost real passwords once. Every
    case below is a failure that actually happened or was one edit away.

.EXAMPLE
    .\database\scripts\test_pgpass.ps1
#>
$ErrorActionPreference = 'Stop'

$writer = Join-Path $PSScriptRoot 'pgpass_write.ps1'
$scratch = Join-Path $env:TEMP ('pgpass_selftest_' + [guid]::NewGuid().ToString('N') + '.conf')

$pass = 0
$fail = 0
function Check([string]$name, [bool]$ok, [string]$detail = '') {
    if ($ok) { $script:pass++; Write-Host "  PASS  $name" -ForegroundColor Green }
    else     { $script:fail++; Write-Host "  FAIL  $name  $detail" -ForegroundColor Red }
}
function Sec([string]$s) { ConvertTo-SecureString $s -AsPlainText -Force }
function Entries([string]$p) {
    # The leading comma matters: `return` unrolls a single-element array, which
    # hands back a bare string whose [0] is its first character, not its first
    # line. That produced a false failure the first time this test ran.
    if (-not (Test-Path $p)) { return ,@() }
    $lines = @([System.IO.File]::ReadAllText($p) -split "`r`n|`n|`r" |
               Where-Object { $_.Trim() -ne '' })
    return ,$lines
}
function FieldsOf([string]$line) { return $line -split '(?<!\\):' }

Write-Host "pgpass_write self-test" -ForegroundColor Cyan
Write-Host "scratch file: $scratch" -ForegroundColor DarkGray
Write-Host ""

# --- 1. writes into a file that does not exist yet --------------------------
& $writer -DbHost 'a.example.com' -DbUser 'postgres.aaa' -SecurePassword (Sec 'pw-one') `
          -PgpassPath $scratch -Quiet | Out-Null
$e = Entries $scratch
Check '1 creates the file with one entry' ($e.Count -eq 1) "got $($e.Count)"
Check '1 fields are host:port:db:user:password' ((FieldsOf $e[0]).Count -eq 5) "got $((FieldsOf $e[0]).Count)"

# --- 2. a second, different project is added, not replaced ------------------
& $writer -DbHost 'b.example.com' -DbUser 'postgres.bbb' -SecurePassword (Sec 'pw-two') `
          -PgpassPath $scratch -Quiet | Out-Null
$e = Entries $scratch
Check '2 second project appended' ($e.Count -eq 2) "got $($e.Count)"
Check '2 first project survived' (($e | Where-Object { $_.StartsWith('a.example.com:') }).Count -eq 1)

# --- 3. re-running for the same project replaces, does not duplicate --------
& $writer -DbHost 'a.example.com' -DbUser 'postgres.aaa' -SecurePassword (Sec 'pw-one-changed') `
          -PgpassPath $scratch -Quiet | Out-Null
$e = Entries $scratch
Check '3 still two entries after re-run' ($e.Count -eq 2) "got $($e.Count)"
$mine = @($e | Where-Object { $_.StartsWith('a.example.com:5432:postgres:postgres.aaa:') })
Check '3 exactly one entry for that project' ($mine.Count -eq 1) "got $($mine.Count)"
Check '3 password was updated' ((FieldsOf $mine[0])[4] -eq 'pw-one-changed') "got '$((FieldsOf $mine[0])[4])'"
Check '3 other project untouched' (($e | Where-Object { $_.StartsWith('b.example.com:') }).Count -eq 1)

# --- 4. a password containing a colon and a backslash -----------------------
# This is what the escaping exists for; an unescaped colon would silently
# create a sixth field and psql would read the wrong password.
& $writer -DbHost 'c.example.com' -DbUser 'postgres.ccc' -SecurePassword (Sec 'we:ird\pass') `
          -PgpassPath $scratch -Quiet | Out-Null
$e = Entries $scratch
$c = @($e | Where-Object { $_.StartsWith('c.example.com:') })[0]
Check '4 three entries now' ($e.Count -eq 3) "got $($e.Count)"
Check '4 awkward password still parses as 5 fields' ((FieldsOf $c).Count -eq 5) "got $((FieldsOf $c).Count)"
Check '4 colon and backslash are escaped on disk' ($c.Contains('we\:ird\\pass')) "line tail: $($c.Substring([Math]::Max(0,$c.Length-20)))"

# --- 5. a backup is taken before each write that has something to back up ---
# Four writes have happened; the first found no file, so three backups is the
# correct answer. The timestamps carry milliseconds so two writes in the same
# second cannot overwrite each other's backup.
$backups = @(Get-ChildItem (Split-Path $scratch) -Filter ((Split-Path $scratch -Leaf) + '.bak-*') -ErrorAction SilentlyContinue)
Check '5 one backup per write, minus the first' ($backups.Count -eq 3) "got $($backups.Count)"

# --- 6. an empty password is refused, and nothing is written ----------------
$before = Entries $scratch
$threw = $false
try {
    & $writer -DbHost 'd.example.com' -DbUser 'postgres.ddd' -SecurePassword (Sec '') `
              -PgpassPath $scratch -Quiet | Out-Null
} catch { $threw = $true }
$after = Entries $scratch
Check '6 empty password throws' $threw
Check '6 file unchanged after refusal' ($after.Count -eq $before.Count) "before $($before.Count), after $($after.Count)"

# --- 7. a corrupt line is discarded, not carried forward --------------------
# The real file was once left holding three bytes of junk; preserving that as
# "another project's entry" would keep it forever and can break psql's parse.
Add-Content -Path $scratch -Value 'a??'
& $writer -DbHost 'e.example.com' -DbUser 'postgres.eee' -SecurePassword (Sec 'pw-five') `
          -PgpassPath $scratch -Quiet | Out-Null
$e = Entries $scratch
Check '7 junk line dropped' (@($e | Where-Object { $_ -eq 'a??' }).Count -eq 0)
Check '7 valid entries all survived' ($e.Count -eq 4) "got $($e.Count)"
foreach ($h in 'a.example.com','b.example.com','c.example.com','e.example.com') {
    Check "7 $h still present" (@($e | Where-Object { $_.StartsWith($h + ':') }).Count -eq 1)
}

# --- cleanup ----------------------------------------------------------------
Remove-Item $scratch -Force -ErrorAction SilentlyContinue
Get-ChildItem (Split-Path $scratch) -Filter ((Split-Path $scratch -Leaf) + '.bak-*') -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host ""
if ($fail -eq 0) {
    Write-Host "$pass passed, 0 failed" -ForegroundColor Green
    exit 0
} else {
    Write-Host "$pass passed, $fail FAILED" -ForegroundColor Red
    exit 1
}
