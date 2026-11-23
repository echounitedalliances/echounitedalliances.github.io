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
--  This is only the record. When it is set, when, is written by the client
--  the moment hasEuaResonantRole comes back true -- a plain update on the
--  caller's own row, already permitted by resonants_self_write
--  (08_rls_policies.sql lets an authenticated Resonant write any column of
--  their own row), so no new policy or function is needed here.
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
