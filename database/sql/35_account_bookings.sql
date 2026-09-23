-- =====================================================================
--  Echo United Alliances -- keeping bookings on a Resonance account
--
--  A booking has always been findable without an account: its reference and
--  a traveller's surname are the credential (find_booking, cancel_booking).
--  An account adds a list. Until now the only way onto that list was to be
--  signed in while booking, silently; there was no way to add a booking made
--  as a guest, to take one off, or to manage one from the list.
--
--    add_booking_to_account        a booking you hold the reference and a
--                                  surname for, onto your account
--    remove_booking_from_account   off your account; the booking itself stands
--    cancel_my_booking             cancel one of your own, no surname needed
--
--  create_booking (10_booking_api.sql) takes p_save_to_account, so keeping a
--  new booking on the account is a choice made at booking time.
--
--  Each of these reads the caller's account from the session. None takes an
--  account id, so none can act on anybody else's. They are security definer
--  and granted to signed-in users only; the list itself is read through
--  v_booking_details, whose row level security already shows each account
--  its own bookings and nothing else.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
--  Add a booking to your account
--
--  The same credential that already retrieves and cancels a booking, so this
--  grants nothing a reference and a surname did not grant before. A booking
--  kept on somebody else's account stays there: it is not taken over, and the
--  message does not say whose it is.
-- ---------------------------------------------------------------------
create or replace function public.add_booking_to_account(p_pnr text, p_family_name text)
returns setof public.v_booking_details
language plpgsql volatile security definer set search_path = public as $$
declare
    v_me    uuid := public.echo_current_resonant();
    v_id    uuid;
    v_owner uuid;
begin
    if v_me is null then
        raise exception 'Sign in to Resonance to keep bookings on your account.'
            using errcode = 'insufficient_privilege';
    end if;

    select b.booking_id, b.resonant_id into v_id, v_owner
      from public.bookings b
     where b.pnr = upper(btrim(coalesce(p_pnr, '')))
       and exists (select 1 from public.passengers p
                    where p.booking_id = b.booking_id
                      and lower(p.family_name) = lower(btrim(coalesce(p_family_name, ''))));

    if v_id is null then
        raise exception 'No booking matches that reference and surname.'
            using errcode = 'no_data_found';
    end if;

    if v_owner is not null and v_owner <> v_me then
        raise exception 'That booking is kept on another Resonance account.'
            using errcode = 'check_violation';
    end if;

    if v_owner is null then
        update public.bookings
           set resonant_id = v_me, updated_at = now()
         where booking_id = v_id;
    end if;

    return query select * from public.v_booking_details where booking_id = v_id;
end;
$$;

comment on function public.add_booking_to_account(text, text) is
    'Keep a booking on the caller''s own Resonance account, found by its reference and any traveller''s surname. Idempotent; refuses a booking kept on another account.';

-- ---------------------------------------------------------------------
--  Take a booking off your account
--
--  Only the link goes. The booking, its seats and its reference are
--  untouched, and it can still be retrieved -- or added back -- with its
--  reference and a surname.
-- ---------------------------------------------------------------------
create or replace function public.remove_booking_from_account(p_booking_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
    v_me uuid := public.echo_current_resonant();
begin
    if v_me is null then
        raise exception 'Sign in to Resonance to manage the bookings on your account.'
            using errcode = 'insufficient_privilege';
    end if;

    update public.bookings
       set resonant_id = null, updated_at = now()
     where booking_id = p_booking_id and resonant_id = v_me;

    if not found then
        raise exception 'That booking is not on your account.'
            using errcode = 'no_data_found';
    end if;
end;
$$;

comment on function public.remove_booking_from_account(uuid) is
    'Take one of the caller''s bookings off their account. The booking itself stands.';

-- ---------------------------------------------------------------------
--  Cancel a booking on your account
--
--  cancel_booking with the account standing in for the surname. Deleting the
--  segments is what returns the seats: the release trigger fires on delete.
-- ---------------------------------------------------------------------
create or replace function public.cancel_my_booking(p_booking_id uuid)
returns setof public.v_booking_details
language plpgsql volatile security definer set search_path = public as $$
declare
    v_me     uuid := public.echo_current_resonant();
    v_status text;
begin
    if v_me is null then
        raise exception 'Sign in to Resonance to manage the bookings on your account.'
            using errcode = 'insufficient_privilege';
    end if;

    select b.status into v_status
      from public.bookings b
     where b.booking_id = p_booking_id and b.resonant_id = v_me
       for update;

    if not found then
        raise exception 'That booking is not on your account.'
            using errcode = 'no_data_found';
    end if;
    if v_status = 'CANCELLED' then
        raise exception 'That booking is already cancelled.'
            using errcode = 'check_violation';
    end if;

    delete from public.booking_segments where booking_id = p_booking_id;
    update public.bookings
       set status = 'CANCELLED', cancelled_at = now(), updated_at = now()
     where booking_id = p_booking_id;

    return query select * from public.v_booking_details where booking_id = p_booking_id;
end;
$$;

comment on function public.cancel_my_booking(uuid) is
    'Cancel one of the caller''s own bookings and return its seats to inventory. The account is the credential.';

-- ---------------------------------------------------------------------
--  Who may call what
--
--  PostgreSQL grants EXECUTE on every new function to PUBLIC, and anon is a
--  member of PUBLIC -- so each is revoked explicitly. A guest has nothing to
--  keep bookings on; their path is the reference and a surname.
-- ---------------------------------------------------------------------
-- The list itself. v_booking_details is security_invoker, so row level
-- security on bookings decides the rows: each account its own, a visitor
-- none. The grant was never written down -- Supabase hands every new view to
-- authenticated by default, and "Your trips" has quietly depended on that.
-- Said here, so the dependency is visible and a build elsewhere works.
grant select on public.v_booking_details to authenticated;

revoke all on function public.add_booking_to_account(text, text) from public, anon;
revoke all on function public.remove_booking_from_account(uuid) from public, anon;
revoke all on function public.cancel_my_booking(uuid) from public, anon;

grant execute on function public.add_booking_to_account(text, text) to authenticated;
grant execute on function public.remove_booking_from_account(uuid) to authenticated;
grant execute on function public.cancel_my_booking(uuid) to authenticated;

commit;
