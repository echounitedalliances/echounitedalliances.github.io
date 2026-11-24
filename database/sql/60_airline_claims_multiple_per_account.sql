-- =====================================================================
--  Echo United Alliances -- one account, several airlines
--
--  Every piece of the claim system so far assumed one account holds at
--  most one airline: resonants.claimed_airline_uid is a single column,
--  "one pending claim at a time" was enforced per account rather than per
--  airline, and release/edit never had to say WHICH airline, because
--  there was only ever the one. That stops being true here: a Resonant
--  who flies for more than one member carrier can now hold more than one.
--
--  THE NEW SHAPE
--
--  airline_claims (54_airline_claims.sql) already records one row per
--  (account, airline, attempt) -- it was always closer to the right shape
--  than the single column sitting beside it. This file finishes that: an
--  account's held airlines are now just its APPROVED rows in this table,
--  and resonants.claimed_airline_uid goes away entirely rather than being
--  kept as a second, now-redundant place the same fact could drift out of
--  sync with.
--
--  One account, many airlines; one airline, at most one account -- that
--  second half still has to hold, so airline_claims gets a real unique
--  index for it (airline_claims_one_holder, airline_uid where status =
--  'approved') instead of the single column doing that job implicitly by
--  only ever being able to hold one value.
--
--  WHAT APPROVING DOES NOW THAT IT DID NOT HAVE TO BEFORE
--
--  Approving used to overwrite the single column, which quietly handled
--  "this airline had a different holder before" by just replacing the
--  value -- their claim row stayed 'approved' forever, a stale fact
--  nothing read again. With the column gone, that old row has to be
--  moved aside explicitly or it collides with the new one-holder-per-
--  airline index. admin_decide_airline_claim and _bulk now set any OTHER
--  approved claim on the same airline to a new status, 'superseded',
--  the moment a different account's claim on it is approved.
--
--  WHY A BACKFILL RUNS BEFORE THE NEW UNIQUE INDEX
--
--  Two cases the live data can actually contain, both resolved before
--  airline_claims_one_holder is added (it would refuse to create
--  otherwise):
--    1. An account claimed an airline before 54_airline_claims.sql put a
--       queue in front of that (43_claim_airline.sql's direct, no-review
--       path) -- claimed_airline_uid is set, but there was never an
--       airline_claims row at all. Backfilled as one, 'approved', so
--       that hold survives the column it used to live in.
--    2. Two different accounts each have an 'approved' row for the same
--       airline from past reassignment, because overwriting the old
--       column never touched the row it left behind (the gap this file
--       closes). Resolved by keeping only the most recently decided one
--       'approved' and marking the rest 'superseded'.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
--  'superseded': a claim that was approved, then stopped being the
--  current holder because the airline was reassigned, not because the
--  claimant did anything or an admin turned them down.
-- ---------------------------------------------------------------------

alter table public.airline_claims drop constraint if exists airline_claims_status_check;
alter table public.airline_claims
    add constraint airline_claims_status_check
    check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'superseded'));

-- ---------------------------------------------------------------------
--  Backfill case 1: a pre-queue direct claim with no airline_claims row.
-- ---------------------------------------------------------------------

insert into public.airline_claims
            (resonant_id, email, display_name, airline_uid, status, submitted_at, decided_at, decided_by, decision_note)
    select r.resonant_id, r.email, r.display_name, r.claimed_airline_uid,
           'approved', now(), now(), 'migration 60',
           'Backfilled from resonants.claimed_airline_uid, self-reported under 43_claim_airline.sql before 54_airline_claims.sql put a reviewed queue in front of claiming.'
      from public.resonants r
     where r.claimed_airline_uid is not null
       and not exists (
           select 1 from public.airline_claims c
            where c.resonant_id = r.resonant_id
              and c.airline_uid = r.claimed_airline_uid
              and c.status = 'approved'
       );

-- ---------------------------------------------------------------------
--  Backfill case 2: more than one 'approved' row on the same airline.
--  Keep the most recently decided one; the rest were already stale the
--  moment the column that used to be the real answer moved on from them.
-- ---------------------------------------------------------------------

with ranked as (
    select claim_id,
           row_number() over (
               partition by airline_uid
               order by decided_at desc nulls last, claim_id desc
           ) as rn
      from public.airline_claims
     where status = 'approved'
)
update public.airline_claims c
   set status        = 'superseded',
       decision_note  = coalesce(c.decision_note || ' ', '')
                         || '(superseded automatically by migration 60: a later approval on this airline took precedence)'
  from ranked
 where ranked.claim_id = c.claim_id
   and ranked.rn > 1;

-- ---------------------------------------------------------------------
--  One account may hold several airlines; one airline holds at most one
--  account. The second half needs its own index now that there is no
--  single column making it true by construction.
-- ---------------------------------------------------------------------

create unique index if not exists airline_claims_one_holder
    on public.airline_claims (airline_uid)
 where status = 'approved';

-- One pending request per (account, airline) rather than per account --
-- asking about two different carriers at once is now a normal thing to
-- do, where asking about the same one twice while the first is still
-- waiting is not.
drop index if exists public.airline_claims_one_pending;
create unique index if not exists airline_claims_one_pending_per_airline
    on public.airline_claims (resonant_id, airline_uid)
 where status = 'pending';

-- ---------------------------------------------------------------------
--  Asking: no longer blocked by "already hold AN airline", only by
--  already holding or already waiting on THIS one.
-- ---------------------------------------------------------------------

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

    if exists (select 1 from public.airline_claims c
                where c.resonant_id = v_resonant.resonant_id
                  and c.airline_uid = p_airline_uid
                  and c.status = 'approved') then
        raise exception 'You already hold this airline.' using errcode = 'check_violation';
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
    'Ask to be recorded as an airline''s Resonant operator. The account comes from the caller''s own session, so a claim cannot be filed in somebody else''s name, the caller must already hold the Resonant Discord role, and may hold or be waiting on any number of OTHER airlines at the same time -- only this exact one is checked.';

-- ---------------------------------------------------------------------
--  Checking on your own: now every claim, not just the latest.
-- ---------------------------------------------------------------------

drop function if exists public.my_airline_claim();

create function public.my_airline_claims()
returns table (
    claim_id      bigint,
    status        text,
    airline_uid   uuid,
    airline_name  text,
    carrier_code  text,
    submitted_at  timestamptz,
    decided_at    timestamptz,
    decision_note text
)
language sql stable security definer set search_path = public as $$
    select c.claim_id, c.status, c.airline_uid, a.airline_name, a.carrier_code,
           c.submitted_at, c.decided_at, c.decision_note
      from public.airline_claims c
      join public.resonants r on r.resonant_id = c.resonant_id
      left join public.v_airline_directory_live a on a.uid = c.airline_uid
     where r.user_id = public.echo_current_user_id()
     order by (c.status = 'approved') desc, (c.status = 'pending') desc, c.submitted_at desc;
$$;

comment on function public.my_airline_claims() is
    'Every one of the caller''s own airline claims, held ones first, then waiting, then history -- not just the latest, now that holding several at once is normal.';

revoke all on function public.my_airline_claims() from public, anon;
grant execute on function public.my_airline_claims() to authenticated;

-- ---------------------------------------------------------------------
--  Deciding: approving one account's claim on an airline steps aside
--  any OTHER account's still-'approved' claim on that same airline,
--  rather than relying on a column overwrite to make that implicit.
-- ---------------------------------------------------------------------

create or replace function public.admin_decide_airline_claim(
    p_claim_id bigint,
    p_approve  boolean,
    p_note     text default null
)
returns table (claim_id bigint, status text, decided_at timestamptz, decided_by text)
language plpgsql volatile security definer set search_path = public as $$
declare
    v_claim public.airline_claims;
    v_actor text;
    v_note  text := nullif(btrim(coalesce(p_note, '')), '');
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may decide an airline claim'
            using errcode = 'insufficient_privilege';
    end if;

    select * into v_claim from public.airline_claims
     where public.airline_claims.claim_id = p_claim_id
       for update;

    if not found then
        raise exception 'No such claim.' using errcode = 'no_data_found';
    end if;
    if v_claim.status <> 'pending' then
        raise exception 'That claim was already % on %.',
            v_claim.status, to_char(v_claim.decided_at, 'DD Mon YYYY')
            using errcode = 'check_violation';
    end if;

    select r.email into v_actor from public.resonants r
     where r.user_id = public.echo_current_user_id();

    if p_approve then
        update public.airline_claims c
           set status        = 'superseded',
               decided_at     = now(),
               decided_by     = v_actor,
               decision_note  = 'Superseded: claim #' || p_claim_id || ' was approved for this airline instead.'
         where c.airline_uid = v_claim.airline_uid
           and c.status = 'approved'
           and c.resonant_id <> v_claim.resonant_id;
    end if;

    update public.airline_claims c
       set status        = case when p_approve then 'approved' else 'rejected' end,
           decided_at    = now(),
           decided_by    = v_actor,
           decision_note = v_note
     where c.claim_id = p_claim_id;

    return query
        select c.claim_id, c.status, c.decided_at, c.decided_by
          from public.airline_claims c where c.claim_id = p_claim_id;
end;
$$;

comment on function public.admin_decide_airline_claim(bigint, boolean, text) is
    'Approve or turn down one claim. Approving steps aside any other account''s still-approved claim on the same airline (status -> superseded) rather than relying on a column overwrite to keep one holder per airline true.';

create or replace function public.admin_decide_airline_claims_bulk(
    p_claim_ids bigint[],
    p_approve   boolean,
    p_note      text default null
)
returns table (
    claim_id   bigint,
    status     text,
    decided_at timestamptz,
    decided_by text,
    skipped    boolean
)
language plpgsql volatile security definer set search_path = public as $$
declare
    v_claim public.airline_claims;
    v_actor text;
    v_note  text := nullif(btrim(coalesce(p_note, '')), '');
    v_id    bigint;
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may decide an airline claim'
            using errcode = 'insufficient_privilege';
    end if;

    if p_claim_ids is null or cardinality(p_claim_ids) = 0 then
        raise exception 'No claims were selected.' using errcode = 'invalid_parameter_value';
    end if;

    select r.email into v_actor from public.resonants r
     where r.user_id = public.echo_current_user_id();

    for v_id in
        select distinct c.claim_id from unnest(p_claim_ids) as c(claim_id) order by c.claim_id
    loop
        select * into v_claim from public.airline_claims
         where public.airline_claims.claim_id = v_id
           for update;

        if not found or v_claim.status <> 'pending' then
            return query
                select v_id, coalesce(v_claim.status, 'not_found'), v_claim.decided_at,
                       v_claim.decided_by, true;
            continue;
        end if;

        if p_approve then
            update public.airline_claims c
               set status        = 'superseded',
                   decided_at     = now(),
                   decided_by     = v_actor,
                   decision_note  = 'Superseded: claim #' || v_id || ' was approved for this airline instead.'
             where c.airline_uid = v_claim.airline_uid
               and c.status = 'approved'
               and c.resonant_id <> v_claim.resonant_id;
        end if;

        update public.airline_claims c
           set status        = case when p_approve then 'approved' else 'rejected' end,
               decided_at     = now(),
               decided_by     = v_actor,
               decision_note  = v_note
         where c.claim_id = v_id;

        return query
            select c.claim_id, c.status, c.decided_at, c.decided_by, false
              from public.airline_claims c where c.claim_id = v_id;
    end loop;
end;
$$;

-- ---------------------------------------------------------------------
--  The admin inbox: already_held_by_someone_else now reads the claims
--  table directly instead of the column that used to answer it.
-- ---------------------------------------------------------------------

create or replace function public.admin_airline_claims_list(
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
                   select 1 from public.airline_claims c2
                    where c2.airline_uid = c.airline_uid
                      and c2.status = 'approved'
                      and c2.resonant_id <> c.resonant_id
               ),
               c.claimant_confirmed
          from public.airline_claims c
          left join public.v_airline_directory_live a on a.uid = c.airline_uid
         where p_status is null or p_status = '' or p_status = 'all'
            or c.status = p_status
         order by (c.status = 'pending') desc, c.submitted_at desc;
end;
$$;

-- ---------------------------------------------------------------------
--  Editing a held airline: which one is now a real argument, not
--  implied by there only ever being one.
-- ---------------------------------------------------------------------

drop function if exists public.update_claimed_airline(text, text);

create function public.update_claimed_airline(
    p_airline_uid    uuid,
    p_airline_name   text default null,
    p_description_md text default null
)
returns setof public.v_airline_profile
language plpgsql volatile security definer set search_path = public as $$
declare
    v_resonant_id uuid;
    v_name text := nullif(btrim(coalesce(p_airline_name, '')), '');
    v_desc text := nullif(btrim(coalesce(p_description_md, '')), '');
begin
    select resonant_id into v_resonant_id from public.resonants
     where user_id = public.echo_current_user_id();

    if not exists (
        select 1 from public.airline_claims c
         where c.resonant_id = v_resonant_id
           and c.airline_uid = p_airline_uid
           and c.status = 'approved'
    ) then
        raise exception 'You have not claimed this airline.'
            using errcode = 'insufficient_privilege';
    end if;

    if v_name is not null and length(v_name) > 80 then
        raise exception 'An airline name is at most 80 characters'
            using errcode = 'check_violation';
    end if;
    if v_desc is not null and length(v_desc) > 4000 then
        raise exception 'A description is at most 4000 characters'
            using errcode = 'check_violation';
    end if;

    insert into public.airline_overrides
                (airline_uid, airline_name, description_md, updated_at, updated_by)
         values (p_airline_uid, v_name, v_desc, now(), public.echo_current_resonant())
    on conflict (airline_uid) do update
       set airline_name   = excluded.airline_name,
           description_md = excluded.description_md,
           updated_at     = excluded.updated_at,
           updated_by     = excluded.updated_by;

    delete from public.airline_overrides ao
     where ao.airline_uid = p_airline_uid
       and ao.airline_name is null and ao.description_md is null
       and ao.division_code is null;

    update public.airlines a
       set airline_name   = coalesce(v_name, a.airline_name),
           description_md = v_desc
     where a.uid = p_airline_uid;

    return query select * from public.v_airline_profile where uid = p_airline_uid;
end;
$$;

comment on function public.update_claimed_airline(uuid, text, text) is
    'Edit the name and description of one airline the caller holds a claim on -- which one is now an argument, since an account may hold several. Nothing here touches division -- that stays admin_move_airline, admin-only.';

revoke all on function public.update_claimed_airline(uuid, text, text) from public, anon;
grant execute on function public.update_claimed_airline(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
--  Releasing a held airline: which one, same reason.
-- ---------------------------------------------------------------------

drop function if exists public.release_claimed_airline();

create function public.release_claimed_airline(p_airline_uid uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
    v_resonant public.resonants;
begin
    select * into v_resonant from public.resonants
     where user_id = public.echo_current_user_id();

    update public.airline_claims c
       set status        = 'withdrawn',
           decided_at     = now(),
           decided_by     = v_resonant.email,
           decision_note  = 'Released by the holder.'
     where c.resonant_id = v_resonant.resonant_id
       and c.airline_uid = p_airline_uid
       and c.status = 'approved';

    if not found then
        raise exception 'You do not hold this airline.' using errcode = 'no_data_found';
    end if;
end;
$$;

comment on function public.release_claimed_airline(uuid) is
    'Clears the caller''s own hold on one airline (status -> withdrawn), chosen by uid since an account may hold several. Exists because the column this used to write (resonants.claimed_airline_uid, see 56_verify_discord_role_server_side.sql) is gone -- there is no longer a column to clear, only a specific claim row.';

revoke all on function public.release_claimed_airline(uuid) from public, anon;
grant execute on function public.release_claimed_airline(uuid) to authenticated;

-- ---------------------------------------------------------------------
--  The public mark: reads the claims table directly now, same
--  "approved and nothing newer superseded it" guarantee the unique
--  index already makes true, so this simplifies rather than growing.
-- ---------------------------------------------------------------------

create or replace function public.airline_claim_holder(p_airline_uid uuid)
returns table (display_name text, held_since timestamptz)
language sql stable security definer set search_path = public as $$
    select r.display_name, c.decided_at
      from public.airline_claims c
      join public.resonants r on r.resonant_id = c.resonant_id
     where c.airline_uid = p_airline_uid
       and c.status = 'approved'
     order by c.decided_at desc
     limit 1;
$$;

comment on function public.airline_claim_holder(uuid) is
    'Whether an airline has a Resonant operator, and their display name, for the public claimed-by mark on its own page. airline_claims_one_holder guarantees at most one approved row per airline, so this never has more than one real answer.';

revoke all on function public.airline_claim_holder(uuid) from public;
grant execute on function public.airline_claim_holder(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
--  The column itself. Every function above has moved off it; this is
--  the only thing in the database still able to write or read it.
-- ---------------------------------------------------------------------

alter table public.resonants drop column if exists claimed_airline_uid;

commit;
