-- =====================================================================
--  Echo United Alliances -- claiming an airline, reviewed rather than
--  self-service
--
--  43_claim_airline.sql let a Resonant set resonants.claimed_airline_uid
--  directly, self-reported, same as a home airport. That shipped, then sat
--  behind Sneak Peek, then came out from behind it -- and only then did it
--  become clear self-reporting with no review was not what was wanted: a
--  claim should be a REQUEST an admin accepts, the same shape as an admin
--  application (28_admin_applications.sql). This file is that queue.
--  claimed_airline_uid itself is untouched -- it is still the column that
--  means "this account's airline" everywhere else on the site (the Airline
--  of the Week card, the claim badge below); only how it gets SET changes,
--  from a direct write to one made by decide_airline_claim after review.
--
--  WHY NO FOREIGN KEY ON resonant_id / email
--
--  Same reasoning as admin_applications: see that file's header.
--
--  WHY airline_uid IS A FOREIGN KEY, UNLIKE resonant_id
--
--  resonants.claimed_airline_uid already references public.airlines (uid)
--  (43_claim_airline.sql), so airline uids are already relied on as a
--  stable key elsewhere on this exact column; this is the same key, not a
--  new risk.
-- =====================================================================

begin;

create table if not exists public.airline_claims (
    claim_id      bigserial primary key,
    -- Deliberately not a foreign key. See the header.
    resonant_id   uuid not null,
    email         text not null,
    display_name  text,
    airline_uid   uuid not null references public.airlines (uid),
    status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
    submitted_at  timestamptz not null default now(),
    decided_at    timestamptz,
    decided_by    text,
    decision_note text
);

comment on table public.airline_claims is
    'Requests to be recorded as an airline''s Resonant operator. Read and written only through the functions below, each of which checks who is calling.';

-- One open request per person at a time -- the same reason
-- admin_applications has this, and the same failure mode without it: a
-- double click files two rows, and the second decision fails on a row that
-- is no longer pending.
create unique index if not exists airline_claims_one_pending
    on public.airline_claims (resonant_id)
 where status = 'pending';

create index if not exists airline_claims_queue
    on public.airline_claims (status, submitted_at desc);

alter table public.airline_claims enable row level security;
revoke all on public.airline_claims from anon, authenticated;
revoke all on sequence public.airline_claims_claim_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------
--  Asking
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
    'Ask to be recorded as an airline''s Resonant operator. The account comes from the caller''s own session, so a claim cannot be filed in somebody else''s name.';

-- ---------------------------------------------------------------------
--  Checking on your own
-- ---------------------------------------------------------------------

create or replace function public.my_airline_claim()
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
     order by c.submitted_at desc
     limit 1;
$$;

comment on function public.my_airline_claim() is
    'The caller''s own most recent claim, so they can see it is pending rather than having to ask.';

-- ---------------------------------------------------------------------
--  The admin inbox
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
    already_held_by_someone_else boolean
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
               )
          from public.airline_claims c
          left join public.v_airline_directory_live a on a.uid = c.airline_uid
         where p_status is null or p_status = '' or p_status = 'all'
            or c.status = p_status
         order by (c.status = 'pending') desc, c.submitted_at desc;
end;
$$;

comment on function public.admin_airline_claims_list(text) is
    'The claim inbox. Pending first. Flags a claim whose airline is already held by a different account, so approving does not silently steal it out from under them.';

-- ---------------------------------------------------------------------
--  Deciding
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
        update public.resonants
           set claimed_airline_uid = v_claim.airline_uid, updated_at = now()
         where resonant_id = v_claim.resonant_id;
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
    'Approve or turn down one claim. Approving sets the account''s claimed_airline_uid directly -- this is the only place that column is written outside a Resonant''s own profile edit.';

revoke all on function
    public.request_airline_claim(uuid),
    public.my_airline_claim(),
    public.admin_airline_claims_list(text),
    public.admin_decide_airline_claim(bigint, boolean, text)
from public, anon;

grant execute on function
    public.request_airline_claim(uuid),
    public.my_airline_claim(),
    public.admin_airline_claims_list(text),
    public.admin_decide_airline_claim(bigint, boolean, text)
to authenticated;

-- ---------------------------------------------------------------------
--  Once approved: editing the airline you hold
--
--  The same three fields admin_update_airline allows (26_airline_overrides,
--  29_airline_division_moves) minus the division move, which stays
--  admin-only -- it rewrites every per-division total on the site, not
--  just one carrier's own page, and that is not a call one operator should
--  be able to make unilaterally for the alliance's figures.
-- ---------------------------------------------------------------------

create or replace function public.update_claimed_airline(
    p_airline_name   text default null,
    p_description_md text default null
)
returns setof public.v_airline_profile
language plpgsql volatile security definer set search_path = public as $$
declare
    v_uid  uuid;
    v_name text := nullif(btrim(coalesce(p_airline_name, '')), '');
    v_desc text := nullif(btrim(coalesce(p_description_md, '')), '');
begin
    select claimed_airline_uid into v_uid from public.resonants
     where user_id = public.echo_current_user_id();

    if v_uid is null then
        raise exception 'You have not claimed an airline.'
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
         values (v_uid, v_name, v_desc, now(), public.echo_current_resonant())
    on conflict (airline_uid) do update
       set airline_name   = excluded.airline_name,
           description_md = excluded.description_md,
           updated_at     = excluded.updated_at,
           updated_by     = excluded.updated_by;

    delete from public.airline_overrides ao
     where ao.airline_uid = v_uid
       and ao.airline_name is null and ao.description_md is null
       and ao.division_code is null;

    update public.airlines a
       set airline_name   = coalesce(v_name, a.airline_name),
           description_md = v_desc
     where a.uid = v_uid;

    return query select * from public.v_airline_profile where uid = v_uid;
end;
$$;

comment on function public.update_claimed_airline(text, text) is
    'Edit the name and description of the one airline the caller holds a claim on. Nothing here touches division -- that stays admin_move_airline, admin-only.';

revoke all on function public.update_claimed_airline(text, text) from public, anon;
grant execute on function public.update_claimed_airline(text, text) to authenticated;

-- ---------------------------------------------------------------------
--  The public mark: who holds this airline
--
--  Anyone, signed in or not -- it is shown on the carrier's own page, which
--  anyone can already read. Only ever answers for an APPROVED claim: there
--  is no self-service path to claimed_airline_uid left once this file is
--  applied, so an approved claim is the one kind of "claimed" that exists
--  now, and the one worth a visitor's trust.
-- ---------------------------------------------------------------------

create or replace function public.airline_claim_holder(p_airline_uid uuid)
returns table (display_name text, held_since timestamptz)
language sql stable security definer set search_path = public as $$
    -- held_since comes from the approved claim, not resonants.updated_at --
    -- that column moves on every later profile edit (a changed display
    -- name, a new home airport), which is not when this airline was
    -- claimed.
    select r.display_name, c.decided_at
      from public.resonants r
      left join public.airline_claims c
             on c.resonant_id = r.resonant_id
            and c.airline_uid = p_airline_uid
            and c.status = 'approved'
     where r.claimed_airline_uid = p_airline_uid
     order by c.decided_at desc nulls last
     limit 1;
$$;

comment on function public.airline_claim_holder(uuid) is
    'Whether an airline has a Resonant operator, and their display name, for the public claimed-by mark on its own page. Reveals only the one column a claim is already meant to make public.';

revoke all on function public.airline_claim_holder(uuid) from public;
grant execute on function public.airline_claim_holder(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
--  The board's Discord notice, same pattern as
--  41_admin_apply_notice.sql / 48_support_tickets.sql: pg_net, after
--  commit, URL in Vault under 'claim_airline_webhook', set by
--  database/scripts/set_claim_airline_webhook.ps1. With no secret set,
--  claims still queue; nobody is pinged.
-- ---------------------------------------------------------------------

create or replace function public.echo_notify_airline_claim()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_url     text;
    v_airline text;
    v_code    text;
begin
    select s.decrypted_secret into v_url
      from vault.decrypted_secrets s
     where s.name = 'claim_airline_webhook';

    if v_url is null or v_url = '' then
        return new;
    end if;

    select a.airline_name, a.carrier_code into v_airline, v_code
      from public.v_airline_directory_live a where a.uid = new.airline_uid;

    perform net.http_post(
        url     := v_url,
        body    := jsonb_build_object('embeds', jsonb_build_array(jsonb_build_object(
                       'title', 'New airline claim: ' || coalesce(v_airline, 'unknown carrier')
                                 || coalesce(' (' || v_code || ')', ''),
                       'color', 4573424,
                       'fields', jsonb_build_array(
                           jsonb_build_object('name', 'From', 'value',
                               coalesce(new.display_name, new.email), 'inline', true)
                       ),
                       'timestamp', to_char(new.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                   ))),
        headers := '{"Content-Type": "application/json"}'::jsonb
    );
    return new;
exception when others then
    -- A notice is never worth losing a claim over.
    return new;
end;
$$;

revoke all on function public.echo_notify_airline_claim() from public, anon, authenticated;

drop trigger if exists airline_claims_notify on public.airline_claims;
create trigger airline_claims_notify
    after insert on public.airline_claims
    for each row execute function public.echo_notify_airline_claim();

commit;
