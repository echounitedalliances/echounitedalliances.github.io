<#
.SYNOPSIS
    Where Echo's database password lives, and how a script points psql at it.

.DESCRIPTION
    Dot-source this, then call Use-EchoCredentials before running psql:

        . "$PSScriptRoot/echo_credentials.ps1"
        Use-EchoCredentials

    Echo's password is kept in its OWN credential file,
    %APPDATA%\postgresql\echo-united-alliances.pgpass, not in psql's shared
    %APPDATA%\postgresql\pgpass.conf.

    The shared file is written by every project on the machine that uses psql,
    and not all of them are careful with it. On 16 September 2026, another
    project's tool rewrote it at 23:02: it dropped the other entry the file
    held, wrote Echo's line back unescaped and with a password Supabase
    rejects, and took no backup. Echo's deploys stopped authenticating, and
    nothing in this repository had touched the file.

    Pointing PGPASSFILE at a file only Echo's scripts write puts that out of
    reach. When PGPASSFILE is set, libpq reads that file and ignores
    pgpass.conf entirely, so whatever another project leaves in the shared file
    cannot reach an Echo connection. It is set for this process only -- never
    for the user account, which would redirect every other project's psql to
    Echo's file and break them instead.
#>

$EchoPgpassPath = Join-Path (Join-Path $env:APPDATA 'postgresql') 'echo-united-alliances.pgpass'

function Use-EchoCredentials {
    if (-not (Test-Path $EchoPgpassPath)) {
        throw ("Echo's database password has not been saved. Run " +
               ".\database\scripts\save_password.ps1 -- it keeps the password in " +
               "$EchoPgpassPath, which no other project writes to.")
    }
    $env:PGPASSFILE = $EchoPgpassPath
}
