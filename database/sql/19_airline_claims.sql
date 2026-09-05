-- =====================================================================
--  Echo United Alliances -- claiming a carrier
--
--  A Resonant who actually runs one of the 590 carriers can ask to be
--  recognised as its owner. The request is reviewed on Discord, by a person,
--  not approved automatically -- so this file only ever creates a *pending*
--  claim from the client. Approval is a separate, privileged path (see the
--  bottom of this file) meant to be called from the Discord bot's own
--  Supabase Edge Function with the service role key, never from the site.
--
--  Once approved, the owner may edit their one carrier the same way an admin
--  edits any carrier (11_profiles_admin.sql) -- same columns, same grant,
--  just scoped to a single row instead of all of them.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Who owns what
-- ---------------------------------------------------------------------

create table if not exists public.airline_owners (
    airline_uid  uuid primary key references public.airlines (uid),
    resonant_id  uuid not null references public.resonants (resonant_id),
    granted_at   timestamptz not null default now()
);

comment on table public.airline_owners is
    'One row per claimed carrier. Written only by decide_airline_claim(); never insertable from the client.';

create index if not exists airline_owners_resonant_idx on public.airline_owners (resonant_id);

alter table public.airline_owners enable row level security;

drop policy if exists airline_owners_self_read on public.airline_owners;
create policy airline_owners_self_read on public.airline_owners
    for select to authenticated
    using (resonant_id = public.echo_current_resonant() or public.echo_is_admin());

grant select on public.airline_owners to authenticated;

create or replace function public.echo_owns_airline(p_uid uuid)
returns boolean language sql stable as $$
    select exists (
        select 1 from public.airline_owners o
         where o.airline_uid = p_uid
           and o.resonant_id = public.echo_current_resonant()
    );
$$;

-- An owner may edit their own carrier -- the exact same columns the admin
-- policy in 11_profiles_admin.sql already granted to `authenticated`, just
-- gated to one row instead of every row.
drop policy if exists airlines_owner_update on public.airlines;
create policy airlines_owner_update on public.airlines
    for update to authenticated
    using (public.echo_owns_airline(uid))
    with check (public.echo_owns_airline(uid));

-- ---------------------------------------------------------------------
-- Claims
-- ---------------------------------------------------------------------

create table if not exists public.airline_claims (
    claim_id            uuid primary key default gen_random_uuid(),
    airline_uid         uuid not null references public.airlines (uid),
    resonant_id         uuid not null references public.resonants (resonant_id),
    discord_username    text not null,
    notes               text,
    status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'denied')),
    -- Filled in by attach_claim_message() once the Discord bot has posted the
    -- review message, so a button click later knows which message to edit.
    discord_message_id  text,
    discord_channel_id  text,
    created_at          timestamptz not null default now(),
    decided_at          timestamptz,
    -- The Discord tag of whoever clicked, not a resonant_id -- the reviewer is
    -- a Discord member reviewing from a channel, not necessarily signed in
    -- anywhere on the site.
    decided_by          text
);

comment on table public.airline_claims is
    'A request to be recognised as one carrier''s owner. Reviewed on Discord; see decide_airline_claim().';

create index if not exists airline_claims_airline_idx on public.airline_claims (airline_uid);

-- At most one open claim per carrier at a time, so two people cannot both be
-- mid-review for the same airline.
create unique index if not exists airline_claims_one_pending
    on public.airline_claims (airline_uid) where status = 'pending';

alter table public.airline_claims enable row level security;

drop policy if exists airline_claims_self_read on public.airline_claims;
create policy airline_claims_self_read on public.airline_claims
    for select to authenticated
    using (resonant_id = public.echo_current_resonant() or public.echo_is_admin());

grant select on public.airline_claims to authenticated;

-- Submitting goes through here rather than a raw insert, so an airline that
-- is already owned or already mid-review is refused before the client ever
-- asks the Discord bot to post anything.
create or replace function public.submit_airline_claim(
    p_airline_uid uuid, p_discord_username text, p_notes text default null
)
returns public.airline_claims
language plpgsql volatile security definer set search_path = public as $$
declare
    v_resonant uuid;
    v_row      public.airline_claims;
begin
    v_resonant := public.echo_current_resonant();
    if v_resonant is null then
        raise exception 'Sign in to Resonance first' using errcode = 'insufficient_privilege';
    end if;

    if trim(coalesce(p_discord_username, '')) = '' then
        raise exception 'A Discord username is required' using errcode = 'check_violation';
    end if;

    if exists (select 1 from public.airline_owners where airline_uid = p_airline_uid) then
        raise exception 'That carrier is already claimed' using errcode = 'check_violation';
    end if;

    if exists (select 1 from public.airline_claims
                where airline_uid = p_airline_uid and status = 'pending') then
        raise exception 'That carrier already has a claim under review' using errcode = 'check_violation';
    end if;

    insert into public.airline_claims (airline_uid, resonant_id, discord_username, notes)
    values (p_airline_uid, v_resonant, trim(p_discord_username), nullif(trim(p_notes), ''))
    returning * into v_row;

    return v_row;
end;
$$;

comment on function public.submit_airline_claim(uuid, text, text) is
    'Files a pending claim for the signed-in Resonant. The client still has to tell the Discord bot to post it for review.';

grant execute on function public.submit_airline_claim(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- The privileged half: called only from the Discord bot's Edge Functions,
-- with the service role key. Deliberately NOT granted to anon/authenticated
-- -- there is no path from the site itself to either of these.
-- ---------------------------------------------------------------------

create or replace function public.attach_claim_message(
    p_claim_id uuid, p_message_id text, p_channel_id text
)
returns void language sql volatile security definer set search_path = public as $$
    update public.airline_claims
       set discord_message_id = p_message_id, discord_channel_id = p_channel_id
     where claim_id = p_claim_id;
$$;

comment on function public.attach_claim_message(uuid, text, text) is
    'Records which Discord message reviews a claim, so a later button click knows what to edit. Service role only.';

create or replace function public.decide_airline_claim(
    p_claim_id uuid, p_approve boolean, p_decided_by text
)
returns public.airline_claims
language plpgsql volatile security definer set search_path = public as $$
declare
    v_row public.airline_claims;
begin
    update public.airline_claims
       set status = case when p_approve then 'approved' else 'denied' end,
           decided_at = now(),
           decided_by = p_decided_by
     where claim_id = p_claim_id and status = 'pending'
    returning * into v_row;

    if not found then
        raise exception 'No pending claim %', p_claim_id using errcode = 'no_data_found';
    end if;

    if p_approve then
        insert into public.airline_owners (airline_uid, resonant_id)
        values (v_row.airline_uid, v_row.resonant_id)
        on conflict (airline_uid) do nothing;
    end if;

    return v_row;
end;
$$;

comment on function public.decide_airline_claim(uuid, boolean, text) is
    'Approves or denies a pending claim and grants ownership on approval. Service role only -- called from the Discord Interactions endpoint after verifying the click really came from Discord.';

commit;
