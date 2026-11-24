-- =====================================================================
--  Echo United Alliances -- a DM when a claim is approved
--
--  58_airline_claim_dm_confirmation.sql's DM only ever covered the moment
--  a claim is FILED. Nothing told the claimant once an admin actually
--  decided it -- they would only find out by coming back to the Resonance
--  page and looking. This adds the other end: the moment
--  admin_decide_airline_claim or admin_decide_airline_claims_bulk
--  (54_airline_claims.sql, 57_admin_decide_airline_claims_bulk.sql) sets
--  a claim's status to approved, a second DM goes out -- no buttons this
--  time, there is nothing left to answer, just the one fact worth
--  knowing without checking.
--
--  A table-level trigger rather than something added inside either
--  decide function: both already do a plain `update ... set status =
--  ...`, and a trigger fires for either one (or any future way a claim
--  might be approved) without having to remember to call it from each
--  place that can set the column.
--
--  WHY old.status = 'approved' IS EXCLUDED, NOT JUST new.status =
--  'approved' ALONE
--
--  Approving does one update; nothing else in this codebase re-saves an
--  already-approved claim. But guarding against it anyway costs one
--  comparison and means a row that is somehow touched again while
--  already approved (a future admin tool, a manual fix in the SQL
--  editor) never sends a second "approved" DM for the same claim.
-- =====================================================================

begin;

create or replace function public.echo_notify_airline_claim_approved()
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
    if new.status <> 'approved' or old.status = 'approved' then
        return new; -- only the moment a claim first becomes approved
    end if;

    select s.decrypted_secret into v_url
      from vault.decrypted_secrets s where s.name = 'claim_dm_function_url';
    select s.decrypted_secret into v_secret
      from vault.decrypted_secrets s where s.name = 'claim_dm_trigger_secret';

    -- Same tolerance as the new-claim DM: either secret missing and the
    -- decision still stands, just silently with no DM sent.
    if v_url is null or v_url = '' or v_secret is null or v_secret = '' then
        return new;
    end if;

    select r.discord_user_id into v_discord_id
      from public.resonants r where r.resonant_id = new.resonant_id;

    if v_discord_id is null or v_discord_id = '' then
        return new;
    end if;

    perform net.http_post(
        url     := v_url,
        body    := jsonb_build_object('claim_id', new.claim_id, 'kind', 'approved'),
        headers := jsonb_build_object(
                       'Content-Type', 'application/json',
                       'x-echo-trigger-secret', v_secret
                   )
    );
    return new;
exception when others then
    -- An admin's decision is never undone by a notice failing to send.
    return new;
end;
$$;

revoke all on function public.echo_notify_airline_claim_approved() from public, anon, authenticated;

drop trigger if exists airline_claims_notify_approved on public.airline_claims;
create trigger airline_claims_notify_approved
    after update on public.airline_claims
    for each row execute function public.echo_notify_airline_claim_approved();

commit;
