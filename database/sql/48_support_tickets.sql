-- =====================================================================
--  Echo United Alliances -- contacting the developers: bugs, suggestions, anything else
--
--  Before this there was no way to tell the people running the site about a
--  bug or an idea except finding someone on Discord. This is the other door:
--  a short, categorised form anyone can use, signed in or not, and an inbox
--  on the admin dashboard that reads exactly like the admin-applications one
--  (28_admin_applications.sql) -- the two problems are the same shape.
--
--  Unlike an admin application, a bug report comes from people who have
--  never made an account and may never make one, so submitting is open to
--  anon as well as authenticated. A signed-in Resonant's email and name come
--  from their own row, exactly as an admin application's does, so nobody can
--  file one in somebody else's name; everyone else types their own email in,
--  or leaves it blank and accepts that nobody can write back.
--
--  WHY NO FOREIGN KEY ON resonant_id / email
--
--  Same reasoning as admin_applications (see 28_admin_applications.sql): a
--  key into resonants is not worth what it costs if resonants is ever
--  truncated by a reload, and a ticket from somebody who later deletes their
--  account should still read, not vanish or orphan a constraint.
-- =====================================================================

begin;

create extension if not exists pg_net;

create table if not exists public.support_tickets (
    ticket_id    bigserial primary key,
    category     text not null check (category in ('bug', 'suggestion', 'account', 'other')),
    subject      text not null check (length(subject) between 1 and 200),
    message      text not null check (length(message) between 1 and 4000),
    page_url     text,
    browser_info text,
    -- Deliberately not a foreign key. See the header.
    resonant_id  uuid,
    email        text,
    display_name text,
    status       text not null default 'open'
                 check (status in ('open', 'in_progress', 'resolved', 'closed')),
    submitted_at timestamptz not null default now(),
    resolved_at  timestamptz,
    resolved_by  text,
    admin_note   text,
    reply        text
);

comment on table public.support_tickets is
    'Bug reports, suggestions and other messages to the people running the site. Read and written only through the functions below, each of which checks who is calling.';

create index if not exists support_tickets_queue
    on public.support_tickets (status, submitted_at desc);

create index if not exists support_tickets_resonant
    on public.support_tickets (resonant_id) where resonant_id is not null;

alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from anon, authenticated;
revoke all on sequence public.support_tickets_ticket_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------
--  Sending one
-- ---------------------------------------------------------------------

create or replace function public.submit_support_ticket(
    p_category     text,
    p_subject      text,
    p_message      text,
    p_page_url     text default null,
    p_email        text default null,
    p_browser_info text default null
)
returns table (ticket_id bigint, submitted_at timestamptz)
language plpgsql volatile security definer set search_path = public as $$
declare
    v_category text := lower(nullif(btrim(coalesce(p_category, '')), ''));
    v_subject  text := nullif(btrim(coalesce(p_subject, '')), '');
    v_message  text := nullif(btrim(coalesce(p_message, '')), '');
    v_resonant uuid := public.echo_current_resonant();
    v_email    text;
    v_name     text;
    v_id       bigint;
begin
    if v_category is null or v_category not in ('bug', 'suggestion', 'account', 'other') then
        raise exception 'Pick what this is about.' using errcode = 'check_violation';
    end if;
    if v_subject is null or length(v_subject) > 200 then
        raise exception 'A subject is required, up to 200 characters.'
            using errcode = 'check_violation';
    end if;
    if v_message is null or length(v_message) > 4000 then
        raise exception 'A message is required, up to 4000 characters.'
            using errcode = 'check_violation';
    end if;

    if v_resonant is not null then
        -- Signed in: the account's own address, never the caller's claim.
        select r.email, r.display_name into v_email, v_name
          from public.resonants r where r.resonant_id = v_resonant;
    else
        v_email := nullif(btrim(coalesce(p_email, '')), '');
        if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
            raise exception 'That does not look like an email address.'
                using errcode = 'check_violation';
        end if;
    end if;

    insert into public.support_tickets
                (category, subject, message, page_url, browser_info, resonant_id, email, display_name)
         values (v_category, v_subject, v_message,
                 nullif(btrim(coalesce(p_page_url, '')), ''),
                 nullif(btrim(coalesce(p_browser_info, '')), ''),
                 v_resonant, v_email, v_name)
      returning public.support_tickets.ticket_id into v_id;

    return query
        select t.ticket_id, t.submitted_at from public.support_tickets t
         where t.ticket_id = v_id;
end;
$$;

comment on function public.submit_support_ticket(text, text, text, text, text, text) is
    'File a support ticket. Open to anyone: a signed-in Resonant''s address comes from their own account, everyone else may leave one to be written back to.';

-- ---------------------------------------------------------------------
--  Checking on your own
-- ---------------------------------------------------------------------

create or replace function public.my_support_tickets()
returns table (
    ticket_id    bigint,
    category     text,
    subject      text,
    status       text,
    submitted_at timestamptz,
    resolved_at  timestamptz,
    reply        text
)
language sql stable security definer set search_path = public as $$
    select t.ticket_id, t.category, t.subject, t.status, t.submitted_at, t.resolved_at, t.reply
      from public.support_tickets t
     where t.resonant_id = public.echo_current_resonant()
     order by t.submitted_at desc;
$$;

comment on function public.my_support_tickets() is
    'The caller''s own tickets, so a signed-in Resonant can see a reply without asking. An anonymous submission has no account to read this back on -- there was nowhere to send it one.';

-- ---------------------------------------------------------------------
--  The admin inbox
-- ---------------------------------------------------------------------

create or replace function public.admin_support_tickets_list(
    p_status text default 'open'
)
returns table (
    ticket_id    bigint,
    category     text,
    subject      text,
    message      text,
    page_url     text,
    browser_info text,
    email        text,
    display_name text,
    status       text,
    submitted_at timestamptz,
    resolved_at  timestamptz,
    resolved_by  text,
    admin_note   text,
    reply        text
)
language plpgsql stable security definer set search_path = public as $$
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may read support tickets'
            using errcode = 'insufficient_privilege';
    end if;

    return query
        select t.ticket_id, t.category, t.subject, t.message, t.page_url, t.browser_info,
               t.email, t.display_name, t.status, t.submitted_at, t.resolved_at,
               t.resolved_by, t.admin_note, t.reply
          from public.support_tickets t
         where p_status is null or p_status = '' or p_status = 'all'
            or t.status = p_status
         order by (t.status = 'open') desc, t.submitted_at desc;
end;
$$;

comment on function public.admin_support_tickets_list(text) is
    'The support inbox. Open first.';

create or replace function public.admin_update_support_ticket(
    p_ticket_id  bigint,
    p_status     text,
    p_admin_note text default null,
    p_reply      text default null
)
returns table (
    ticket_id   bigint,
    status      text,
    resolved_at timestamptz,
    resolved_by text
)
language plpgsql volatile security definer set search_path = public as $$
declare
    v_status text := lower(nullif(btrim(coalesce(p_status, '')), ''));
    v_actor  text;
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may update a support ticket'
            using errcode = 'insufficient_privilege';
    end if;
    if v_status is null or v_status not in ('open', 'in_progress', 'resolved', 'closed') then
        raise exception 'That is not a status.' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.support_tickets where ticket_id = p_ticket_id) then
        raise exception 'No such ticket.' using errcode = 'no_data_found';
    end if;

    select r.email into v_actor from public.resonants r
     where r.user_id = public.echo_current_user_id();

    update public.support_tickets t
       set status      = v_status,
           admin_note  = coalesce(nullif(btrim(coalesce(p_admin_note, '')), ''), t.admin_note),
           reply       = coalesce(nullif(btrim(coalesce(p_reply, '')), ''), t.reply),
           resolved_at = case when v_status in ('resolved', 'closed') then now() else null end,
           resolved_by = case when v_status in ('resolved', 'closed') then v_actor else null end
     where t.ticket_id = p_ticket_id;

    return query
        select t.ticket_id, t.status, t.resolved_at, t.resolved_by
          from public.support_tickets t where t.ticket_id = p_ticket_id;
end;
$$;

comment on function public.admin_update_support_ticket(bigint, text, text, text) is
    'Move a ticket through its status, and optionally leave an internal note or a reply the submitter can read back on their own Resonance page.';

revoke all on function
    public.submit_support_ticket(text, text, text, text, text, text),
    public.my_support_tickets(),
    public.admin_support_tickets_list(text),
    public.admin_update_support_ticket(bigint, text, text, text)
from public, anon;

grant execute on function public.submit_support_ticket(text, text, text, text, text, text)
    to anon, authenticated;
grant execute on function
    public.my_support_tickets(),
    public.admin_support_tickets_list(text),
    public.admin_update_support_ticket(bigint, text, text, text)
to authenticated;

-- ---------------------------------------------------------------------
--  The board's Discord notice
--
--  Same pattern as 41_admin_apply_notice.sql: pg_net, after commit, URL in
--  Vault under 'support_ticket_webhook', set by
--  database/scripts/set_support_webhook.ps1. With no secret set, tickets
--  still queue; nobody is pinged.
-- ---------------------------------------------------------------------

create or replace function public.echo_notify_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_url text;
begin
    select s.decrypted_secret into v_url
      from vault.decrypted_secrets s
     where s.name = 'support_ticket_webhook';

    if v_url is null or v_url = '' then
        return new;
    end if;

    perform net.http_post(
        url     := v_url,
        body    := jsonb_build_object('embeds', jsonb_build_array(jsonb_build_object(
                       'title', initcap(new.category) || ': ' || new.subject,
                       'description', left(new.message, 1000),
                       'color', 4573424,   -- 0x45C8F0, as the admin-apply notice uses
                       'fields', jsonb_build_array(
                           jsonb_build_object('name', 'From', 'value',
                               coalesce(new.display_name, new.email, 'Anonymous'), 'inline', true),
                           jsonb_build_object('name', 'Page', 'value',
                               coalesce(new.page_url, '-'), 'inline', true)
                       ),
                       'timestamp', to_char(new.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                   ))),
        headers := '{"Content-Type": "application/json"}'::jsonb
    );
    return new;
exception when others then
    -- A notice is never worth losing a ticket over.
    return new;
end;
$$;

revoke all on function public.echo_notify_support_ticket() from public, anon, authenticated;

drop trigger if exists support_tickets_notify on public.support_tickets;
create trigger support_tickets_notify
    after insert on public.support_tickets
    for each row execute function public.echo_notify_support_ticket();

commit;
