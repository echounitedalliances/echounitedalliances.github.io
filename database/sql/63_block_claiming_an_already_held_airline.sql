-- =====================================================================
--  Echo United Alliances -- an already-claimed airline cannot be
--  requested by somebody else
--
--  request_airline_claim only ever blocked the CALLER'S own double-claim
--  ("you already hold this one" / "you already have a claim on this one
--  waiting"). Nothing stopped a second account from asking for an
--  airline someone else already holds -- the request would sit pending
--  until an admin turned it down, or worse, approved it and bumped the
--  existing holder (admin_decide_airline_claim's supersede logic exists
--  for exactly that, and still does, for the admin side of this). This
--  closes the self-service side of it: the request itself is refused
--  the moment it is made, so there is nothing for an admin to catch
--  later.
--
--  admin_decide_airline_claim's supersede-on-approve stays as it is.
--  An admin reassigning a held airline by hand (a request filed before
--  this went live, or a deliberate override) is a different action from
--  a member asking for a carrier that is plainly already taken, and
--  this file only closes the second one.
-- =====================================================================

begin;

create or replace function public.request_airline_claim(
    p_airline_uid uuid
)
returns table (claim_id bigint, status text, submitted_at timestamptz)
language plpgsql volatile security definer set search_path = public as $$
declare
    v_resonant  public.resonants;
    v_holder_id uuid;
    v_id        bigint;
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

    -- airline_claims_one_holder guarantees at most one approved row per
    -- airline, so this is either nobody, the caller, or somebody else --
    -- never more than one answer.
    select resonant_id into v_holder_id
      from public.airline_claims
     where airline_uid = p_airline_uid and status = 'approved'
     limit 1;

    if v_holder_id is not null then
        if v_holder_id = v_resonant.resonant_id then
            raise exception 'You already hold this airline.' using errcode = 'check_violation';
        else
            raise exception 'This airline is already claimed by a different account.'
                using errcode = 'check_violation';
        end if;
    end if;

    if exists (select 1 from public.airline_claims c
                where c.resonant_id = v_resonant.resonant_id
                  and c.airline_uid = p_airline_uid
                  and c.status = 'pending') then
        raise exception 'You already have a claim on this airline waiting to be reviewed.'
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
    'Ask to be recorded as an airline''s Resonant operator. Refused if the caller does not hold the Resonant Discord role, or if the airline already has a different approved holder -- an admin can still reassign one by hand, but a member cannot ask for a carrier someone else already holds.';

commit;
