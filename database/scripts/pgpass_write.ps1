<#
.SYNOPSIS
    Write one entry into psql's pgpass credential file, safely.

.DESCRIPTION
    Split out of save_password.ps1 so it can be tested without a keyboard:
    it takes a SecureString rather than prompting, and -PgpassPath lets a test
    point it at a scratch file.

    The rules it follows, all of which exist because breaking them lost
    credentials once already:

      * back the file up before writing anything
      * read it with ReadAllText and split lines here, rather than trusting
        Get-Content, which has returned a whole file as a single element
      * replace only the entry for this exact host/port/database/user and
        leave every other project's entry alone
      * verify afterwards that exactly one entry is ours AND that the total
        did not shrink, and point at the backup if either check fails

.EXAMPLE
    $sec = Read-Host -AsSecureString
    .\pgpass_write.ps1 -DbHost db.example.com -DbUser postgres.abc -SecurePassword $sec
#>
param(
    [Parameter(Mandatory = $true)] [string]$DbHost,
    [Parameter(Mandatory = $true)] [string]$DbUser,
    [int]$Port = 5432,
    [string]$Database = 'postgres',
    [Parameter(Mandatory = $true)] [System.Security.SecureString]$SecurePassword,
    [string]$PgpassPath,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

if (-not $PgpassPath) {
    $PgpassPath = Join-Path (Join-Path $env:APPDATA 'postgresql') 'pgpass.conf'
}
$dir = Split-Path $PgpassPath -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

# pgpass escaping: a backslash or colon inside a field is prefixed with a
# backslash. Done with String.Replace, not -replace: the regex form needs the
# pattern escaped and the replacement not, which is exactly the kind of
# asymmetry that produced "The regular expression pattern \ is not valid".
function ConvertTo-PgpassField([string]$value) {
    return $value.Replace('\', '\\').Replace(':', '\:')
}

$plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
             [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword))
if ([string]::IsNullOrWhiteSpace($plain)) { throw 'No password supplied.' }

$escHost = ConvertTo-PgpassField $DbHost
$escDb   = ConvertTo-PgpassField $Database
$escUser = ConvertTo-PgpassField $DbUser
$prefix  = "$escHost`:$Port`:$escDb`:$escUser`:"
$line    = $prefix + (ConvertTo-PgpassField $plain)

# --- back up before touching anything ---------------------------------------
$backup = $null
if (Test-Path $PgpassPath) {
    $backup = "$PgpassPath.bak-" + (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
    Copy-Item $PgpassPath $backup -Force
    if (-not $Quiet) { Write-Host "Backed up existing credentials to $backup" -ForegroundColor DarkGray }
}

# --- read existing entries ---------------------------------------------------
$existing = @()
if (Test-Path $PgpassPath) {
    $raw = [System.IO.File]::ReadAllText($PgpassPath)
    $existing = @($raw -split "`r`n|`n|`r" | Where-Object { $_.Trim() -ne '' })
}
# Keep other projects' entries, but only if they are actually entries. A
# malformed line - this file was left holding three bytes of junk once - would
# otherwise be carried forward forever and can make psql fail to parse the
# whole file. A valid entry has at least four colons; plain Split is enough to
# tell junk from an entry, and avoids a lookbehind regex that has been a source
# of escaping bugs in this script twice.
$others = @($existing |
    Where-Object { -not $_.StartsWith($prefix) } |
    Where-Object { $_.Split(':').Count -ge 5 })
$dropped = $existing.Count - $others.Count -
           @($existing | Where-Object { $_.StartsWith($prefix) }).Count
if ($dropped -gt 0 -and -not $Quiet) {
    Write-Host "Dropped $dropped malformed line$(if ($dropped -ne 1) {'s'}) from $PgpassPath (kept in the backup)." -ForegroundColor Yellow
}

# --- write -------------------------------------------------------------------
Set-Content -Path $PgpassPath -Value @($others + $line) -Encoding ascii
$plain = $null
[GC]::Collect()

# Readable only by this account; psql refuses a world-readable file on Unix and
# this keeps the Windows equivalent tight.
icacls $PgpassPath /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null

# --- verify ------------------------------------------------------------------
$after = @([System.IO.File]::ReadAllText($PgpassPath) -split "`r`n|`n|`r" |
           Where-Object { $_.Trim() -ne '' })
$mine  = @($after | Where-Object { $_.StartsWith($prefix) })

if ($mine.Count -ne 1) {
    throw "Expected exactly one entry for $DbUser in $PgpassPath, found $($mine.Count)." +
          $(if ($backup) { " The previous file is at $backup." })
}
if ($after.Count -ne $others.Count + 1) {
    throw "Entry count went from $($existing.Count) to $($after.Count); something was lost." +
          $(if ($backup) { " Restore from $backup." })
}

if (-not $Quiet) {
    Write-Host ""
    Write-Host "$($after.Count) credential entr$(if ($after.Count -eq 1) { 'y' } else { 'ies' }) in ${PgpassPath}:" -ForegroundColor Green
    foreach ($entry in $after) {
        $f = $entry -split '(?<!\\):'
        Write-Host "  $($f[0]):$($f[1]):$($f[2]):$($f[3]):<password hidden>" -ForegroundColor DarkGray
    }
}

# so a caller can assert on it
[pscustomobject]@{
    Path         = $PgpassPath
    EntryCount   = $after.Count
    Backup       = $backup
    WroteForUser = $DbUser
}
