-- =====================================================================
--  Echo United Alliances -- applying to be an admin, and deciding on it
--
--  13_admin_grants.sql already holds grant_admin and revoke_admin, the audit
--  trail, and the two rules that keep the site administrable: you cannot
--  demote yourself, and the last admin cannot be demoted at all. What none of
--  it ever had was a record of who ASKED.
--
--  Applications arrived in Discord, were read by whoever happened to be
--  looking, and were actioned by hand in SQL -- or quietly not actioned,
--  which is the failure mode that does not announce itself. There was nothing
--  to open and check, and no way to tell a request that had been turned down
--  from one nobody had got to yet.
--
--  This file is the inbox. Two ways in, because both already happen:
--
--    'site'     a signed-in member asks, from their own account. The email is
--               read from their Resonance row, never accepted as an argument,
--               so an application cannot be filed in somebody else's name.
--    'relayed'  an admin logs a request that came through Discord or a
--               division leader. This is how nearly every request arrives
--               today, and refusing to record those would leave the inbox
--               permanently incomplete.
--
--  Approving calls grant_admin rather than writing is_admin directly, so an
--  approval lands in admin_audit next to every grant ever made by hand, and
--  inherits its refusal to promote an email with no account behind it.
--
--  WHY NO FOREIGN KEY ON email
--
--  The natural thing is email -> resonants.email. It is the wrong thing here,
--  for the same reason airline_overrides has no key to airlines. resonants
--  carries home_airport -> airports and home_division -> divisions, and
--  02_load_from_csv.sql truncates both of those with RESTART IDENTITY
--  CASCADE. Truncate cascade walks foreign keys, so a key added for the sake
--  of integrity is the precise mechanism that would empty this table.
--  admin_bootstrap and admin_audit both store bare emails for this reason;
--  this matches them.
--
--  WHY THE TABLE IS UNREADABLE
--
--  It holds an email address and a Discord handle for each applicant, and
--  everything reaches it through a function that checks who is asking. There
--  is no policy that grants a direct select, deliberately: 08_rls_policies
--  lets a Resonant read exactly one row of resonants, their own, and an
--  inbox that leaked applicants' addresses to the membership would quietly
--  undo that. web/src/lib/policies.ts says who can see this and is part of
--  the same commit.
-- =====================================================================

begin;

create table if not exists public.admin_applications (
    application_id bigserial primary key,
    -- Deliberately not a foreign key. See the header.
    email          text not null
                   check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    discord        text,
    reason         text,
    status         text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
    source         text not null default 'site'
                   check (source in ('site', 'relayed')),
    -- Who passed it on, when it did not come from the applicant's own account.
    relayed_by     text,
    submitted_at   timestamptz not null default now(),
    decided_at     timestamptz,
    decided_by     text,
    decision_note  text
);

comment on table public.admin_applications is
    'Requests for site admin, however they arrived. Read and written only through the functions below, each of which checks who is calling.';

-- One open request per person. Without this, a member who clicks twice is
-- two rows in the inbox and the second decision fails on a row that is no
-- longer pending.
create unique index if not exists admin_applications_one_pending
    on public.admin_applications (lower(email))
 where status = 'pending';

create index if not exists admin_applications_queue
    on public.admin_applications (status, submitted_at desc);

alter table public.admin_applications enable row level security;
revoke all on public.admin_applications from anon, authenticated;
revoke all on sequence public.admin_applications_application_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------
--  Asking
-- ---------------------------------------------------------------------

create or replace function public.apply_for_admin(
    p_discord text default null,
    p_reason  text default null
)
returns table (
    application_id bigint,
    status         text,
    submitted_at   timestamptz
)
language plpgsql volatile security definer set search_path = public as $$
declare
    v_email   text;
    v_admin   boolean;
    v_discord text := nullif(btrim(coalesce(p_discord, '')), '');
    v_reason  text := nullif(btrim(coalesce(p_reason,  '')), '');
    v_id      bigint;
begin
    -- The address is taken from the account, never from the caller. This is
    -- the whole reason applying is a function rather than an insert policy.
    select r.email, r.is_admin into v_email, v_admin
      from public.resonants r
     where r.user_id = public.echo_current_user_id();

    if v_email is null then
        raise exception 'You need a Resonance account to apply.'
            using errcode = 'insufficient_privilege';
    end if;

    if v_admin then
        raise exception 'You are already an admin.' using errcode = 'check_violation';
    end if;

    if v_reason is not null and length(v_reason) > 1000 then
        raise exception 'Keep it to 1000 characters or fewer.'
            using errcode = 'check_violation';
    end if;
    if v_discord is not null and length(v_discord) > 64 then
        raise exception 'That does not look like a Discord handle.'
            using errcode = 'check_violation';
    end if;

    if exists (select 1 from public.admin_applications a
                where lower(a.email) = lower(v_email) and a.status = 'pending') then
        raise exception 'You already have an application waiting to be read.'
            using errcode = 'unique_violation';
    end if;

    insert into public.admin_applications (email, discord, reason, source)
         values (lower(v_email), v_discord, v_reason, 'site')
      returning public.admin_applications.application_id into v_id;

    return query
        select a.application_id, a.status, a.submitted_at
          from public.admin_applications a
         where a.application_id = v_id;
end;
$$;

comment on function public.apply_for_admin(text, text) is
    'Ask to become an admin. The email comes from the caller''s own Resonance row, so an application cannot be filed under someone else''s address.';

-- What the applicant themselves can see: their own request, and nothing else.
create or replace function public.my_admin_application()
returns table (
    application_id bigint,
    status         text,
    submitted_at   timestamptz,
    decided_at     timestamptz,
    decision_note  text
)
language sql stable security definer set search_path = public as $$
    select a.application_id, a.status, a.submitted_at, a.decided_at, a.decision_note
      from public.admin_applications a
      join public.resonants r on lower(r.email) = lower(a.email)
     where r.user_id = public.echo_current_user_id()
     order by a.submitted_at desc
     limit 1;
$$;

comment on function public.my_admin_application() is
    'The caller''s own most recent request, so they can see it was received rather than having to ask.';

-- ---------------------------------------------------------------------
--  Logging one that arrived somewhere else
-- ---------------------------------------------------------------------

create or replace function public.record_admin_application(
    p_email   text,
    p_discord text default null,
    p_reason  text default null
)
returns table (
    application_id bigint,
    email          text,
    status         text,
    submitted_at   timestamptz
)
language plpgsql volatile security definer set search_path = public as $$
declare
    v_email   text := lower(nullif(btrim(coalesce(p_email, '')), ''));
    v_discord text := nullif(btrim(coalesce(p_discord, '')), '');
    v_reason  text := nullif(btrim(coalesce(p_reason,  '')), '');
    v_actor   text;
    v_id      bigint;
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may record an application'
            using errcode = 'insufficient_privilege';
    end if;

    if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception 'That is not an email address.' using errcode = 'check_violation';
    end if;

    if exists (select 1 from public.admin_applications a
                where lower(a.email) = v_email and a.status = 'pending') then
        raise exception 'There is already an open application for %.', v_email
            using errcode = 'unique_violation';
    end if;

    select r.email into v_actor from public.resonants r
     where r.user_id = public.echo_current_user_id();

    insert into public.admin_applications (email, discord, reason, source, relayed_by)
         values (v_email, v_discord, v_reason, 'relayed', v_actor)
      returning public.admin_applications.application_id into v_id;

    return query
        select a.application_id, a.email, a.status, a.submitted_at
          from public.admin_applications a
         where a.application_id = v_id;
end;
$$;

comment on function public.record_admin_application(text, text, text) is
    'Log a request that came through Discord or a division leader, so the inbox is the whole picture rather than only the part that arrived through this site.';

-- ---------------------------------------------------------------------
--  Reading the inbox
-- ---------------------------------------------------------------------

create or replace function public.admin_applications_list(
    p_status text default 'pending'
)
returns table (
    application_id bigint,
    email          text,
    discord        text,
    reason         text,
    status         text,
    source         text,
    relayed_by     text,
    submitted_at   timestamptz,
    decided_at     timestamptz,
    decided_by     text,
    decision_note  text,
    display_name   text,
    -- grant_admin refuses an email that has never signed in. Saying so in the
    -- list means an admin finds that out before clicking Approve, not after.
    has_account    boolean,
    is_admin       boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may read admin applications'
            using errcode = 'insufficient_privilege';
    end if;

    return query
        select a.application_id, a.email, a.discord, a.reason, a.status,
               a.source, a.relayed_by, a.submitted_at, a.decided_at,
               a.decided_by, a.decision_note,
               r.display_name,
               r.resonant_id is not null,
               coalesce(r.is_admin, false)
          from public.admin_applications a
          left join public.resonants r on lower(r.email) = lower(a.email)
         where p_status is null or p_status = '' or p_status = 'all'
            or a.status = p_status
         order by (a.status = 'pending') desc, a.submitted_at desc;
end;
$$;

comment on function public.admin_applications_list(text) is
    'The admin inbox. Pending first. Reports whether the applicant has an account, because an approval cannot land without one.';

-- ---------------------------------------------------------------------
--  Deciding
-- ---------------------------------------------------------------------

create or replace function public.decide_admin_application(
    p_application_id bigint,
    p_approve        boolean,
    p_note           text default null
)
returns table (
    application_id bigint,
    email          text,
    status         text,
    decided_at     timestamptz,
    decided_by     text
)
language plpgsql volatile security definer set search_path = public as $$
declare
    v_app    public.admin_applications;
    v_actor  text;
    v_note   text := nullif(btrim(coalesce(p_note, '')), '');
    v_dummy  record;
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may decide an application'
            using errcode = 'insufficient_privilege';
    end if;

    select * into v_app from public.admin_applications
     where public.admin_applications.application_id = p_application_id
       for update;

    if not found then
        raise exception 'No such application.' using errcode = 'no_data_found';
    end if;
    if v_app.status <> 'pending' then
        raise exception 'That application was already % on %.',
            v_app.status, to_char(v_app.decided_at, 'DD Mon YYYY')
            using errcode = 'check_violation';
    end if;

    select r.email into v_actor from public.resonants r
     where r.user_id = public.echo_current_user_id();

    if p_approve then
        -- Through grant_admin, not around it: that is what writes admin_audit,
        -- and what refuses an email that has never signed in. If it raises,
        -- the whole statement rolls back and the application stays pending --
        -- which is right, because nothing was granted.
        select * into v_dummy from public.grant_admin(
            v_app.email,
            coalesce(v_note, 'approved from the admin inbox'));
    end if;

    update public.admin_applications a
       set status        = case when p_approve then 'approved' else 'rejected' end,
           decided_at    = now(),
           decided_by    = v_actor,
           decision_note = v_note
     where a.application_id = p_application_id;

    return query
        select a.application_id, a.email, a.status, a.decided_at, a.decided_by
          from public.admin_applications a
         where a.application_id = p_application_id;
end;
$$;

comment on function public.decide_admin_application(bigint, boolean, text) is
    'Approve or turn down one request. Approving goes through grant_admin so it is audited alongside every other promotion.';

-- PostgreSQL grants EXECUTE on a new function to PUBLIC, and every role is a
-- member of PUBLIC -- so revoking from anon alone changes nothing at all, and
-- anon could call each of these and be turned away only by the check inside
-- the body. Correct, but one edit away from not being. The default comes off
-- first, and then the grant below is the whole list of who may call them.
revoke all on function
    public.apply_for_admin(text, text),
    public.my_admin_application(),
    public.record_admin_application(text, text, text),
    public.admin_applications_list(text),
    public.decide_admin_application(bigint, boolean, text)
from public, anon;

grant execute on function
    public.apply_for_admin(text, text),
    public.my_admin_application(),
    public.record_admin_application(text, text, text),
    public.admin_applications_list(text),
    public.decide_admin_application(bigint, boolean, text)
to authenticated;

commit;
