-- =====================================================================
--  Echo United Alliances -- granting and revoking admin
--
--  The first admin is set by hand, in SQL, by whoever runs the database: no
--  address is kept in this public file. After that admins promote and demote
--  trusted people themselves without touching SQL again.
--
--  The rules, enforced in the database rather than in the site:
--    * only an admin may grant or revoke admin
--    * an admin cannot revoke their own admin, so the site can never be left
--      with nobody able to administer it
--    * every change is recorded in admin_audit, with who did it
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- The first admin
--
-- Not in this file. Run once, by hand, after that account has signed in:
--     update public.resonants set is_admin = true where lower(email) = lower('...');
-- (An email-matched bootstrap table lived here until 40_lock_admin_flag.sql.)
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------

create table if not exists public.admin_audit (
    audit_id    bigserial primary key,
    at          timestamptz not null default now(),
    actor_email text,
    target_email text not null,
    action      text not null check (action in ('GRANT', 'REVOKE')),
    note        text
);

create index if not exists admin_audit_at_idx on public.admin_audit (at desc);

alter table public.admin_audit enable row level security;
drop policy if exists admin_audit_admin_read on public.admin_audit;
create policy admin_audit_admin_read on public.admin_audit
    for select to authenticated using (public.echo_is_admin());
grant select on public.admin_audit to authenticated;

-- ---------------------------------------------------------------------
-- Grant and revoke
-- ---------------------------------------------------------------------

create or replace function public.grant_admin(p_email text, p_note text default null)
returns table (email text, is_admin boolean)
language plpgsql volatile security definer set search_path = public as $$
declare
    v_actor text;
    v_hit   integer;
begin
    if not public.echo_is_admin() then
        raise exception 'Only an admin can grant admin' using errcode = 'insufficient_privilege';
    end if;

    select r.email into v_actor from public.resonants r
     where r.user_id = public.echo_current_user_id();

    update public.resonants r
       set is_admin = true, updated_at = now()
     where lower(r.email) = lower(trim(p_email));
    get diagnostics v_hit = row_count;

    if v_hit = 0 then
        raise exception 'No Resonance account with the email %. They must sign in once first.',
            p_email using errcode = 'no_data_found';
    end if;

    insert into public.admin_audit (actor_email, target_email, action, note)
    values (v_actor, lower(trim(p_email)), 'GRANT', p_note);

    return query
        select r.email, r.is_admin from public.resonants r
         where lower(r.email) = lower(trim(p_email));
end;
$$;

comment on function public.grant_admin(text, text) is
    'Promote an existing Resonant to admin. Caller must already be an admin; the target must have signed in at least once.';

create or replace function public.revoke_admin(p_email text, p_note text default null)
returns table (email text, is_admin boolean)
language plpgsql volatile security definer set search_path = public as $$
declare
    v_actor text;
    v_self  boolean;
begin
    if not public.echo_is_admin() then
        raise exception 'Only an admin can revoke admin' using errcode = 'insufficient_privilege';
    end if;

    select r.email, lower(r.email) = lower(trim(p_email))
      into v_actor, v_self
      from public.resonants r
     where r.user_id = public.echo_current_user_id();

    -- Locking yourself out is the one mistake that cannot be undone from the
    -- site, so it is refused outright.
    if v_self then
        raise exception 'You cannot revoke your own admin. Ask another admin to do it.'
            using errcode = 'check_violation';
    end if;

    -- And never leave the site with no admin at all.
    if (select count(*) from public.resonants where is_admin) <= 1 then
        raise exception 'That is the last admin account; promote someone else first.'
            using errcode = 'check_violation';
    end if;

    update public.resonants r
       set is_admin = false, updated_at = now()
     where lower(r.email) = lower(trim(p_email));

    insert into public.admin_audit (actor_email, target_email, action, note)
    values (v_actor, lower(trim(p_email)), 'REVOKE', p_note);

    return query
        select r.email, r.is_admin from public.resonants r
         where lower(r.email) = lower(trim(p_email));
end;
$$;

comment on function public.revoke_admin(text, text) is
    'Demote an admin. Refuses to remove your own admin, and refuses to remove the last one.';

grant execute on function public.grant_admin(text, text)  to authenticated;
grant execute on function public.revoke_admin(text, text) to authenticated;

-- Who currently holds it.
create or replace view public.v_admins
with (security_invoker = on) as
select r.resonant_id, r.email, r.display_name, r.joined_at
  from public.resonants r
 where r.is_admin;

grant select on public.v_admins to authenticated;

commit;
