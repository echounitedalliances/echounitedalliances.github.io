-- =====================================================================
--  Echo United Alliances -- a visible mark for a Discord-verified member
--
--  Discord sign-in already refuses anyone without the Resonant role on the
--  EUA server (lib/auth.tsx, hasEuaResonantRole, added when that check was
--  tightened from plain membership to the role). What it never did was keep
--  a record of it: the check runs once, against the one-time OAuth
--  provider_token, and is gone the moment that sign-in finishes. A plain
--  password account, or a Discord account signed in before that tightening,
--  has no way to show it ever passed.
--
--  This is only the record of when. How it gets WRITTEN does matter, though:
--  40_lock_admin_flag.sql narrowed the client's update grant on resonants to
--  display_name, given_name, family_name, home_airport and home_division
--  only, specifically because a wide grant on this table is how an account
--  patched itself to is_admin before that file. This column was never added
--  to that grant, so a plain client-side update to it is refused -- correct,
--  if quiet about it; a client is not where "this account proved it holds a
--  Discord role" should be allowed to assert itself. See
--  56_verify_discord_role_server_side.sql for how it is actually set now:
--  a Supabase Edge Function re-checks Discord itself and writes with the
--  service role, which is the only route past this grant that is not also
--  a hole wide enough for an account to fake its own verification.
--
--  It is a timestamp, not a bare flag, for the same reason joined_at is:
--  "since when" is worth keeping, "yes/no" throws it away. Nothing clears
--  it automatically if the role is later removed in Discord -- the site has
--  no way to notice that happening short of the account signing in with
--  Discord again, which is the same limitation hasEuaResonantRole already
--  accepted for the sign-in gate itself.
-- =====================================================================

begin;

alter table public.resonants
    add column if not exists discord_role_verified_at timestamptz;

comment on column public.resonants.discord_role_verified_at is
    'When this account last proved it holds the Resonant role on the EUA Discord server, via Discord sign-in (lib/auth.tsx). Null if never verified. Not re-checked unless they sign in with Discord again, so a role removed in Discord afterwards is not reflected here.';

commit;
