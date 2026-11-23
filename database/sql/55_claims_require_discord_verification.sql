-- =====================================================================
--  Echo United Alliances -- claiming an airline requires the Resonant
--  Discord role
--
--  53_discord_resonant_badge.sql added resonants.discord_role_verified_at,
--  set the moment a Discord sign-in confirms the Resonant role
--  (lib/auth.tsx, hasEuaResonantRole) and shown as a badge on the account.
--  Up to now that was only ever a badge -- it gated nothing. This makes it
--  gate the one thing claiming an airline is actually meant to prove: that
--  whoever is asking is a real, Discord-verified member of the alliance,
--  not just anyone who made a Resonance account with an email and a
--  password.
--
--  Only request_airline_claim is replaced below. Everything downstream of
--  a claim -- the admin decision, the public claimed-by mark, the
--  Discord notice -- is unchanged, since by the time a claim exists it has
--  already passed this check.
-- =====================================================================

begin;

create or replace function public.request_airline_claim(
    p_airline_uid uuid
)
returns table (claim_id bigint, status text, submitted_at timestamptz)
language plpgsql volatile security definer set search_path = public as $$
declare
    v_resonant public.resonants;
    v_id       bigint;
begin
    select * into v_resonant from public.resonants
     where user_id = public.echo_current_user_id();

    if v_resonant.resonant_id is null then
        raise exception 'You need a Resonance account to claim an airline.'
            using errcode = 'insufficient_privilege';
    end if;

    if v_resonant.discord_role_verified_at is null then
        raise exception 'Sign in with Discord first -- claiming an airline needs the Resonant role on the EUA server.'
            using errcode = 'insufficient_privilege';
    end if;

    if not exists (select 1 from public.airlines where uid = p_airline_uid) then
        raise exception 'No such carrier.' using errcode = 'no_data_found';
    end if;

    if v_resonant.claimed_airline_uid = p_airline_uid then
        raise exception 'You already hold this airline.' using errcode = 'check_violation';
    end if;

    if exists (select 1 from public.airline_claims c
                where c.resonant_id = v_resonant.resonant_id and c.status = 'pending') then
        raise exception 'You already have a claim waiting to be reviewed.'
            using errcode = 'unique_violation';
    end if;

    insert into public.airline_claims (resonant_id, email, display_name, airline_uid)
         values (v_resonant.resonant_id, v_resonant.email, v_resonant.display_name, p_airline_uid)
      returning public.airline_claims.claim_id into v_id;

    return query
        select c.claim_id, c.status, c.submitted_at
          from public.airline_claims c where c.claim_id = v_id;
end;
$$;

comment on function public.request_airline_claim(uuid) is
    'Ask to be recorded as an airline''s Resonant operator. The account comes from the caller''s own session, so a claim cannot be filed in somebody else''s name, and the caller must already hold the Resonant Discord role (discord_role_verified_at).';

commit;
