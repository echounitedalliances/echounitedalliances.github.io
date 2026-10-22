-- =====================================================================
--  Echo United Alliances -- the board's Discord notice, sent from here
--
--  Until October 2026 the site posted each admin application to the
--  board's Discord channel itself, which meant the webhook URL was compiled
--  into the public bundle: anyone could read it out of devtools (or out of
--  assets/ in the repository) and post into that channel.
--
--  Now the database sends it. When an application lands in the queue from
--  the site, this trigger posts the same message through pg_net. The URL
--  lives in Supabase Vault under the name 'admin_apply_webhook' and is set
--  by database/scripts/set_admin_webhook.ps1 -- never in this file, never
--  in the site. With no secret set, applications still queue; nobody is
--  pinged.
--
--  pg_net sends after the transaction commits and in the background, so a
--  slow or failing Discord can neither delay nor refuse an application.
--  Relayed applications are not posted: they came from Discord already.
-- =====================================================================

begin;

create extension if not exists pg_net;

create or replace function public.echo_notify_admin_application()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_url text;
begin
    if new.source <> 'site' then
        return new;
    end if;

    select s.decrypted_secret into v_url
      from vault.decrypted_secrets s
     where s.name = 'admin_apply_webhook';

    if v_url is null or v_url = '' then
        return new;
    end if;

    perform net.http_post(
        url     := v_url,
        body    := jsonb_build_object('embeds', jsonb_build_array(jsonb_build_object(
                       'title', 'New alliance admin application',
                       'color', 4573424,   -- 0x45C8F0, as the site used
                       'fields', jsonb_build_array(
                           jsonb_build_object('name', 'Email', 'value', new.email, 'inline', true),
                           jsonb_build_object('name', 'Discord', 'value', coalesce(nullif(new.discord, ''), '–'), 'inline', true)
                       ),
                       'timestamp', to_char(new.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                   ))),
        headers := '{"Content-Type": "application/json"}'::jsonb
    );
    return new;
exception when others then
    -- A notice is never worth losing an application over.
    return new;
end;
$$;

revoke all on function public.echo_notify_admin_application() from public, anon, authenticated;

drop trigger if exists admin_applications_notify on public.admin_applications;
create trigger admin_applications_notify
    after insert on public.admin_applications
    for each row execute function public.echo_notify_admin_application();

commit;
