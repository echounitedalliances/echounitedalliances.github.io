-- =====================================================================
--  Echo United Alliances -- "that's me" / "not me" over a Discord DM
--
--  Admins reviewing an airline claim have had to take the claimant's word
--  for it: the claim says who submitted it, but nothing confirms that the
--  Discord account behind it actually meant to. This adds a second check,
--  run the moment a claim is filed: the EUA Resonance bot DMs the
--  claimant on Discord with two buttons, "That's me" and "That's not
--  me", and the admin inbox shows whether (and how) they answered.
--
--  Two new pieces, both best-effort -- a claim still queues with neither
--  working, the same tolerance 54_airline_claims.sql already has for its
--  own Discord channel notice:
--
--    supabase/functions/discord-claim-dm      sends the DM, triggered
--                                              below, right after insert
--    supabase/functions/discord-interactions  Discord's own callback when
--                                              a button is tapped
--
--  WHY resonants.discord_user_id IS NEW
--
--  Nothing on this site has ever needed the claimant's actual Discord
--  snowflake id before -- verify-discord-role only ever needed to know
--  THAT the role check passed, not who to message afterwards. It is
--  captured the same place and the same way discord_role_verified_at
--  already is: inside verify-discord-role, server-side, at the one
--  moment a provider_token exists to ask Discord with. See that
--  function's own updated header.
--
--  WHY A SEPARATE TRIGGER, NOT A CHANGE TO echo_notify_airline_claim
--
--  The channel notice and the claimant DM fail independently of each
--  other (one secret missing does not mean the other is), and either
--  one erroring must never cost the claim row or the other notice. Two
--  small trigger functions, each swallowing its own exception, keep that
--  failure domain separate the same way one failing is not supposed to
--  take down request_airline_claim itself.
--
--  WHY claimant_confirmed IS NULLABLE, NOT A DEFAULT false
--
--  Same principle as discord_role_verified_at and hasEuaResonantRole's
--  null case throughout this codebase: "no answer yet" and "said no" are
--  different facts, and a false default would make every claim that
--  simply has not been answered read as a denial. Null means not asked,
--  not sent, or not answered yet -- never treated as a no. A denial does
--  not even need this column read: discord-interactions sets the claim's
--  own status to withdrawn directly, which already drops it out of the
--  pending queue.
-- =====================================================================

begin;

alter table public.resonants
    add column if not exists discord_user_id text;

comment on column public.resonants.discord_user_id is
    'The Discord account''s own snowflake id, captured by verify-discord-role at the one moment a provider_token is on hand to ask Discord for it. Lets the site message that exact account later (the claim confirmation DM) without trusting anything a client request could supply.';

alter table public.airline_claims
    add column if not exists claimant_confirmed boolean;

comment on column public.airline_claims.claimant_confirmed is
    'True once the claimant themselves tapped "That''s me" on the confirmation DM (discord-claim-dm / discord-interactions). Null means no DM could be sent (no discord_user_id on file) or no reply yet -- never a no. A "That''s not me" tap withdraws the claim directly instead of setting this false.';

-- ---------------------------------------------------------------------
--  admin_airline_claims_list grows one column. Postgres will not let
--  create or replace change a function's returns table shape, so the
--  old one has to go first.
-- ---------------------------------------------------------------------

drop function if exists public.admin_airline_claims_list(text);

create function public.admin_airline_claims_list(
    p_status text default 'pending'
)
returns table (
    claim_id      bigint,
    email         text,
    display_name  text,
    airline_uid   uuid,
    airline_name  text,
    carrier_code  text,
    division_name text,
    status        text,
    submitted_at  timestamptz,
    decided_at    timestamptz,
    decided_by    text,
    decision_note text,
    already_held_by_someone_else boolean,
    claimant_confirmed boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may read airline claims'
            using errcode = 'insufficient_privilege';
    end if;

    return query
        select c.claim_id, c.email, c.display_name, c.airline_uid,
               a.airline_name, a.carrier_code, a.division_name,
               c.status, c.submitted_at, c.decided_at, c.decided_by, c.decision_note,
               exists (
                   select 1 from public.resonants r
                    where r.claimed_airline_uid = c.airline_uid
                      and r.resonant_id <> c.resonant_id
               ),
               c.claimant_confirmed
          from public.airline_claims c
          left join public.v_airline_directory_live a on a.uid = c.airline_uid
         where p_status is null or p_status = '' or p_status = 'all'
            or c.status = p_status
         order by (c.status = 'pending') desc, c.submitted_at desc;
end;
$$;

comment on function public.admin_airline_claims_list(text) is
    'The claim inbox. Pending first. Flags a claim whose airline is already held by a different account, and whether the claimant themselves confirmed it over the Discord DM.';

revoke all on function public.admin_airline_claims_list(text) from public, anon;
grant execute on function public.admin_airline_claims_list(text) to authenticated;

-- ---------------------------------------------------------------------
--  Sending the DM: fire-and-forget, right after a claim is filed.
-- ---------------------------------------------------------------------

create or replace function public.echo_notify_airline_claim_dm()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_url        text;
    v_secret     text;
    v_discord_id text;
begin
    select s.decrypted_secret into v_url
      from vault.decrypted_secrets s where s.name = 'claim_dm_function_url';
    select s.decrypted_secret into v_secret
      from vault.decrypted_secrets s where s.name = 'claim_dm_trigger_secret';

    -- Either one unset: no DM goes out, but the claim still queues --
    -- same tolerance echo_notify_airline_claim already has for its own
    -- missing secret.
    if v_url is null or v_url = '' or v_secret is null or v_secret = '' then
        return new;
    end if;

    select r.discord_user_id into v_discord_id
      from public.resonants r where r.resonant_id = new.resonant_id;

    -- Pre-dates this column (verified before discord_user_id existed),
    -- or -- should not happen given 55_claims_require_discord_verification
    -- -- never verified at all. Either way there is no account to DM.
    if v_discord_id is null or v_discord_id = '' then
        return new;
    end if;

    perform net.http_post(
        url     := v_url,
        body    := jsonb_build_object('claim_id', new.claim_id),
        headers := jsonb_build_object(
                       'Content-Type', 'application/json',
                       'x-echo-trigger-secret', v_secret
                   )
    );
    return new;
exception when others then
    -- A DM is never worth losing a claim over, same reasoning as the
    -- channel notice right above this one.
    return new;
end;
$$;

revoke all on function public.echo_notify_airline_claim_dm() from public, anon, authenticated;

drop trigger if exists airline_claims_notify_dm on public.airline_claims;
create trigger airline_claims_notify_dm
    after insert on public.airline_claims
    for each row execute function public.echo_notify_airline_claim_dm();

commit;
