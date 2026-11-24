-- =====================================================================
--  Echo United Alliances -- a word filter in front of claimed airlines'
--  descriptions
--
--  update_claimed_airline (65) lets an airline's approved claim holder
--  rewrite its public description. From here on, every such description
--  is checked first against a list of terms kept in the database:
--
--    no match  -> published at once, exactly as before
--    any match -> NOT published. It waits in description_reviews until an
--                 admin approves it (and it goes live) or rejects it. The
--                 old description stays up in the meantime, and the admin
--                 channel is pinged (the claim webhook from 54).
--
--  Why hold rather than refuse: a word list cannot read intent. It will
--  catch some innocent text ("this airline is the bomb"), and a person
--  should make that call rather than the list. Why a list for now: it is
--  free, instant and private. An AI reading for ill will is planned for
--  later, and it can feed the same queue: anything it flags gets held
--  exactly like a list match.
--
--  THE TERMS ARE NOT IN THIS FILE. The repository is public, and a list of
--  slurs does not belong on it. moderation_terms starts empty. Admins add
--  and remove terms from the admin dashboard (admin_moderation_terms_*),
--  and database/moderation/terms.csv, which is git-ignored, seeds it via
--  database/scripts/load_moderation_terms.ps1.
--
--  How a term matches (echo_moderation_hits):
--    word      a whole word or phrase, after the text is folded (lower
--              case, accents removed, 0/1/3/4/5/7/@/$ read as o/i/e/a/
--              s/t/a/s, and, for terms without a doubled letter, runs of one
--              letter squeezed to one), so "Tr4sh", "trásh" and "TRAAASH"
--              are all "trash"
--    contains  the same folding, matched anywhere, even inside a word
--    regex     a regular expression on the lower-cased raw text, for
--              links and invites, and for profanity in Vietnamese, Korean,
--              Chinese, Hindi and Bengali, which folding would mangle
--              (Vietnamese loses meaning without its accents; the others
--              are not Latin letters at all). Bengali terms match anywhere,
--              since its vowel signs break the regex word edges.
-- =====================================================================

begin;

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------
-- The terms
-- ---------------------------------------------------------------------

create table if not exists public.moderation_terms (
    term      text primary key,
    kind      text not null default 'word' check (kind in ('word', 'contains', 'regex')),
    category  text not null default 'other'
              check (category in ('slur', 'profanity', 'attack', 'alliance', 'hate', 'politics', 'spam', 'other')),
    added_at  timestamptz not null default now(),
    added_by  text
);

comment on table public.moderation_terms is
    'Terms that hold a claimed airline''s new description for admin review (66_description_moderation.sql). Not readable by the public; admins manage it through admin_moderation_terms_*.';

alter table public.moderation_terms enable row level security;
revoke all on public.moderation_terms from anon, authenticated;

-- ---------------------------------------------------------------------
-- Held descriptions
-- ---------------------------------------------------------------------

create table if not exists public.description_reviews (
    review_id      bigserial primary key,
    airline_uid    uuid not null references public.airlines (uid),
    resonant_id    uuid not null,
    description_md text not null,
    matched        text[] not null default '{}',
    status         text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected', 'superseded')),
    submitted_at   timestamptz not null default now(),
    decided_at     timestamptz,
    decided_by     text,
    decision_note  text
);

comment on table public.description_reviews is
    'Claimed-airline descriptions the word filter held back (66_description_moderation.sql). Read and decided only through the functions below.';

-- One waiting description per airline: a newer submission replaces the
-- older one (marked superseded) rather than queueing behind it.
create unique index if not exists description_reviews_one_pending
    on public.description_reviews (airline_uid)
 where status = 'pending';

create index if not exists description_reviews_queue
    on public.description_reviews (status, submitted_at desc);

alter table public.description_reviews enable row level security;
revoke all on public.description_reviews from anon, authenticated;

-- ---------------------------------------------------------------------
-- Matching
-- ---------------------------------------------------------------------

create or replace function public.echo_moderation_fold(p text)
returns text
language sql immutable parallel safe set search_path = public, extensions as $$
    select translate(lower(extensions.unaccent(coalesce(p, ''))), '013457@$', 'oieastas')
$$;

comment on function public.echo_moderation_fold(text) is
    'Text as the word filter compares it: lower case, no accents, common digit/symbol stand-ins read as letters.';

create or replace function public.echo_moderation_squeeze(p text)
returns text
language sql immutable parallel safe as $$
    select regexp_replace(p, '([a-z])\1+', '\1', 'g')
$$;

-- A term matches the folded text as it is, or -- when the term itself has
-- no doubled letters -- with every run of one letter squeezed to one, so
-- "traaash" still reads as "trash" while "ass" never shrinks to "as".
create or replace function public.echo_moderation_hits(p_text text)
returns text[]
language sql stable security definer set search_path = public, extensions as $$
    -- Words are compared as space-padded runs of letters and digits, so a
    -- term matches whole words only and needs no escaping.
    with t as (
        select ' ' || regexp_replace(public.echo_moderation_fold(p_text), '[^a-z0-9]+', ' ', 'g') || ' ' as folded,
               ' ' || regexp_replace(public.echo_moderation_squeeze(public.echo_moderation_fold(p_text)), '[^a-z0-9]+', ' ', 'g') || ' ' as squeezed,
               lower(coalesce(p_text, '')) as raw
    ),
    m as (
        select term, kind, category,
               btrim(regexp_replace(public.echo_moderation_fold(term), '[^a-z0-9]+', ' ', 'g')) as ft,
               public.echo_moderation_fold(term) = public.echo_moderation_squeeze(public.echo_moderation_fold(term)) as single
          from public.moderation_terms
    )
    select coalesce(array_agg(distinct m.category || ': ' || m.term), '{}')
      from m, t
     where (m.kind = 'regex' or m.ft <> '') and case m.kind
             when 'word' then
                 strpos(t.folded, ' ' || m.ft || ' ') > 0 or (m.single and strpos(t.squeezed, ' ' || m.ft || ' ') > 0)
             when 'contains' then
                 strpos(t.folded, m.ft) > 0 or (m.single and strpos(t.squeezed, m.ft) > 0)
             else t.raw ~ m.term
           end
$$;

comment on function public.echo_moderation_hits(text) is
    'Every moderation term the text matches, as "category: term". Empty when it is clean.';

revoke all on function public.echo_moderation_hits(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Publishing a description (shared by the holder's save and an admin's
-- approval, so both write it the same way)
-- ---------------------------------------------------------------------

create or replace function public.echo_publish_airline_description(p_airline_uid uuid, p_desc text)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
    insert into public.airline_overrides (airline_uid, description_md, updated_at, updated_by)
         values (p_airline_uid, p_desc, now(), public.echo_current_resonant())
    on conflict (airline_uid) do update
       set description_md = excluded.description_md,
           updated_at     = excluded.updated_at,
           updated_by     = excluded.updated_by;

    update public.airlines a
       set description_md = p_desc
     where a.uid = p_airline_uid;
end;
$$;

revoke all on function public.echo_publish_airline_description(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- The holder's save: 65's function, with the filter in front
-- ---------------------------------------------------------------------

create or replace function public.update_claimed_airline(
    p_airline_uid    uuid,
    p_description_md text default null
)
returns setof public.v_airline_profile
language plpgsql volatile security definer set search_path = public as $$
declare
    v_resonant_id uuid;
    v_desc text := nullif(btrim(coalesce(p_description_md, '')), '');
    v_hits text[];
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

    if v_desc is null then
        return query select * from public.v_airline_profile where uid = p_airline_uid;
        return;
    end if;

    if length(v_desc) > 4000 then
        raise exception 'A description is at most 4000 characters'
            using errcode = 'check_violation';
    end if;

    v_hits := public.echo_moderation_hits(v_desc);

    if cardinality(v_hits) > 0 then
        update public.description_reviews
           set status = 'superseded', decided_at = now()
         where airline_uid = p_airline_uid and status = 'pending';

        insert into public.description_reviews (airline_uid, resonant_id, description_md, matched)
             values (p_airline_uid, v_resonant_id, v_desc, v_hits);
    else
        -- A clean save also replaces anything still waiting: the holder
        -- has moved on from it.
        update public.description_reviews
           set status = 'superseded', decided_at = now()
         where airline_uid = p_airline_uid and status = 'pending';

        perform public.echo_publish_airline_description(p_airline_uid, v_desc);
    end if;

    -- Unchanged when held: the client asks my_description_reviews() whether
    -- the save is waiting.
    return query select * from public.v_airline_profile where uid = p_airline_uid;
end;
$$;

comment on function public.update_claimed_airline(uuid, text) is
    'Edit the description of one airline the caller holds a claim on. A description the word filter matches is held for admin review (66_description_moderation.sql) instead of published. The name stays locked to the game data (65).';

revoke all on function public.update_claimed_airline(uuid, text) from public, anon;
grant execute on function public.update_claimed_airline(uuid, text) to authenticated;

-- The holder's view of their own waiting (or last turned-down)
-- descriptions. Which terms matched is not shown, so the list cannot be
-- probed one word at a time.
create or replace function public.my_description_reviews()
returns table (
    airline_uid    uuid,
    status         text,
    submitted_at   timestamptz,
    decided_at     timestamptz,
    decision_note  text
)
language sql stable security definer set search_path = public as $$
    select distinct on (r.airline_uid)
           r.airline_uid, r.status, r.submitted_at, r.decided_at, r.decision_note
      from public.description_reviews r
      join public.resonants me on me.resonant_id = r.resonant_id
     where me.user_id = public.echo_current_user_id()
       and r.status in ('pending', 'rejected')
     order by r.airline_uid, r.submitted_at desc
$$;

revoke all on function public.my_description_reviews() from public, anon;
grant execute on function public.my_description_reviews() to authenticated;

-- ---------------------------------------------------------------------
-- Admin: the queue
-- ---------------------------------------------------------------------

create or replace function public.admin_description_reviews_list(p_status text default 'pending')
returns table (
    review_id      bigint,
    airline_uid    uuid,
    airline_name   text,
    carrier_code   text,
    division_code  text,
    airline_slug   text,
    submitted_by   text,
    description_md text,
    current_md     text,
    matched        text[],
    status         text,
    submitted_at   timestamptz,
    decided_at     timestamptz,
    decided_by     text,
    decision_note  text
)
language plpgsql stable security definer set search_path = public as $$
begin
    if not public.echo_is_admin() then
        raise exception 'Admins only.' using errcode = 'insufficient_privilege';
    end if;
    return query
    select r.review_id, r.airline_uid, a.airline_name, a.carrier_code, a.division_code, a.airline_slug,
           coalesce(nullif(btrim(concat_ws(' ', rs.given_name, rs.family_name)), ''), rs.display_name),
           r.description_md, a.description_md, r.matched, r.status,
           r.submitted_at, r.decided_at, r.decided_by, r.decision_note
      from public.description_reviews r
      left join public.v_airline_directory_live a on a.uid = r.airline_uid
      left join public.resonants rs on rs.resonant_id = r.resonant_id
     where p_status = 'all' or r.status = p_status
     order by (r.status = 'pending') desc, r.submitted_at desc
     limit 200;
end;
$$;

revoke all on function public.admin_description_reviews_list(text) from public, anon;
grant execute on function public.admin_description_reviews_list(text) to authenticated;

create or replace function public.admin_decide_description_review(
    p_review_id bigint,
    p_approve   boolean,
    p_note      text default null
)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
    r public.description_reviews;
begin
    if not public.echo_is_admin() then
        raise exception 'Admins only.' using errcode = 'insufficient_privilege';
    end if;

    select * into r from public.description_reviews where review_id = p_review_id for update;
    if r.review_id is null or r.status <> 'pending' then
        raise exception 'That description is no longer waiting for review.'
            using errcode = 'check_violation';
    end if;

    if p_approve then
        if not exists (
            select 1 from public.airline_claims c
             where c.resonant_id = r.resonant_id and c.airline_uid = r.airline_uid and c.status = 'approved'
        ) then
            raise exception 'Whoever wrote it no longer holds this airline; turn it down instead.'
                using errcode = 'check_violation';
        end if;
        perform public.echo_publish_airline_description(r.airline_uid, r.description_md);
    end if;

    update public.description_reviews
       set status        = case when p_approve then 'approved' else 'rejected' end,
           decided_at    = now(),
           decided_by    = public.echo_current_resonant()::text,
           decision_note = nullif(btrim(coalesce(p_note, '')), '')
     where review_id = p_review_id;
end;
$$;

revoke all on function public.admin_decide_description_review(bigint, boolean, text) from public, anon;
grant execute on function public.admin_decide_description_review(bigint, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- Admin: the terms
-- ---------------------------------------------------------------------

create or replace function public.admin_moderation_terms_list()
returns setof public.moderation_terms
language plpgsql stable security definer set search_path = public as $$
begin
    if not public.echo_is_admin() then
        raise exception 'Admins only.' using errcode = 'insufficient_privilege';
    end if;
    return query select * from public.moderation_terms order by category, term;
end;
$$;

create or replace function public.admin_moderation_terms_add(
    p_term text, p_kind text default 'word', p_category text default 'other'
)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
    v_term text := btrim(coalesce(p_term, ''));
begin
    if not public.echo_is_admin() then
        raise exception 'Admins only.' using errcode = 'insufficient_privilege';
    end if;
    if v_term = '' then
        raise exception 'Type a term first.' using errcode = 'check_violation';
    end if;
    if p_kind = 'regex' then
        perform '' ~ v_term;  -- an invalid pattern fails here, not on someone's save
    else
        v_term := lower(v_term);
    end if;
    insert into public.moderation_terms (term, kind, category, added_by)
         values (v_term, p_kind, p_category, public.echo_current_resonant()::text)
    on conflict (term) do update set kind = excluded.kind, category = excluded.category;
end;
$$;

create or replace function public.admin_moderation_terms_remove(p_term text)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
    if not public.echo_is_admin() then
        raise exception 'Admins only.' using errcode = 'insufficient_privilege';
    end if;
    delete from public.moderation_terms where term = p_term;
end;
$$;

-- Lets an admin try a sentence against the list without saving anything.
create or replace function public.admin_moderation_test(p_text text)
returns text[]
language plpgsql stable security definer set search_path = public as $$
begin
    if not public.echo_is_admin() then
        raise exception 'Admins only.' using errcode = 'insufficient_privilege';
    end if;
    return public.echo_moderation_hits(p_text);
end;
$$;

revoke all on function public.admin_moderation_terms_list() from public, anon;
revoke all on function public.admin_moderation_terms_add(text, text, text) from public, anon;
revoke all on function public.admin_moderation_terms_remove(text) from public, anon;
revoke all on function public.admin_moderation_test(text) from public, anon;
grant execute on function public.admin_moderation_terms_list() to authenticated;
grant execute on function public.admin_moderation_terms_add(text, text, text) to authenticated;
grant execute on function public.admin_moderation_terms_remove(text) to authenticated;
grant execute on function public.admin_moderation_test(text) to authenticated;

-- ---------------------------------------------------------------------
-- Telling the admins: the same Discord webhook as new airline claims
-- (54, Vault secret 'claim_airline_webhook'). Never worth losing a save over.
-- ---------------------------------------------------------------------

create or replace function public.echo_notify_description_review()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_url     text;
    v_airline text;
    v_code    text;
begin
    select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'claim_airline_webhook';
    if v_url is null or v_url = '' then
        return new;
    end if;

    select a.airline_name, a.carrier_code into v_airline, v_code
      from public.v_airline_directory_live a where a.uid = new.airline_uid;

    perform net.http_post(
        url     := v_url,
        body    := jsonb_build_object('embeds', jsonb_build_array(jsonb_build_object(
                       'title', 'Description held for review: ' || coalesce(v_airline, 'unknown carrier')
                                 || coalesce(' (' || v_code || ')', ''),
                       'description', 'The word filter matched ' || cardinality(new.matched)
                                 || ' term(s). Approve or turn it down in the admin dashboard.',
                       'color', 16098851,
                       'timestamp', to_char(new.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                   ))),
        headers := '{"Content-Type": "application/json"}'::jsonb
    );
    return new;
exception when others then
    return new;
end;
$$;

revoke all on function public.echo_notify_description_review() from public, anon, authenticated;

drop trigger if exists description_reviews_notify on public.description_reviews;
create trigger description_reviews_notify
    after insert on public.description_reviews
    for each row execute function public.echo_notify_description_review();

commit;
