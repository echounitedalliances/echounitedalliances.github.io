-- =====================================================================
--  Echo United Alliances -- self-claimed airline
--
--  There is no reliable way to work out which carrier a Resonant flies for:
--  the game export carries no Discord identity at all, and divisions.leader_uid
--  (a game UID, not a person) is only filled in for one division's roster. So
--  rather than guess, a Resonant says so themselves, the same way they already
--  set home_airport and home_division -- self-reported, not verified against
--  the game, free to change or clear at any time.
--
--  No new RLS policy: resonants_self_write (08_rls_policies) already lets an
--  authenticated Resonant update every column of their own row, this one
--  included.
-- =====================================================================

begin;

alter table public.resonants
    add column if not exists claimed_airline_uid uuid references public.airlines (uid);

comment on column public.resonants.claimed_airline_uid is
    'Self-claimed by the Resonant on the Resonance page -- not verified against the game, same as home_airport and home_division. NULL means nothing claimed.';

create index if not exists resonants_claimed_airline_idx
    on public.resonants (claimed_airline_uid);

notify pgrst, 'reload schema';

commit;

notify pgrst, 'reload schema';
