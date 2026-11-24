-- =====================================================================
--  Echo United Alliances -- fixing request_airline_claim: every request
--  was failing, not just ones on an already-held airline
--
--  63_block_claiming_an_already_held_airline.sql's new holder lookup
--  read `status` with no table qualifier:
--
--      select resonant_id into v_holder_id
--        from public.airline_claims
--       where airline_uid = p_airline_uid and status = 'approved';
--
--  but this function RETURNS TABLE (claim_id bigint, status text,
--  submitted_at timestamptz) -- which gives it an implicit variable
--  named status for that output column. Postgres's default setting
--  (plpgsql.variable_conflict = error) refuses to guess whether a bare
--  `status` means the column or that variable: every single call to
--  request_airline_claim raised "column reference \"status\" is
--  ambiguous", for any airline at all, not only ones that were actually
--  already held. Qualifying both columns with a table alias, the same
--  as every other query in this function already does, removes the
--  ambiguity instead of relying on Postgres to pick a side.
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

    select c.resonant_id into v_holder_id
      from public.airline_claims c
     where c.airline_uid = p_airline_uid and c.status = 'approved'
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

commit;
