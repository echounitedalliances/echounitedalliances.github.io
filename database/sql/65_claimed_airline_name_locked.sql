-- =====================================================================
--  Echo United Alliances -- a claim holder can no longer rename their
--  airline
--
--  update_claimed_airline let the holder change both name and
--  description. The name is locked now -- it stays whatever the weekly
--  game-data import says, same as every other airline -- and only the
--  description stays self-editable. admin_update_airline is untouched:
--  an admin can still rename a carrier by hand, the same as always.
--
--  WHILE IN HERE: an empty description now actually means "leave it as
--  is", not "clear it"
--
--  The form's own placeholder always said "Leave empty to keep it as
--  is", but the old function wrote description_md = v_desc
--  unconditionally -- an empty v_desc (null, after trimming) wiped the
--  custom description back to the auto-generated one every time someone
--  saved a blank textarea, which could never happen on purpose once the
--  name field is gone and this is the only field left on the form. Now
--  a blank description is a no-op: nothing is read, written, or
--  touched, and the row returned is exactly what was already there.
-- =====================================================================

begin;

drop function if exists public.update_claimed_airline(uuid, text, text);

create function public.update_claimed_airline(
    p_airline_uid    uuid,
    p_description_md text default null
)
returns setof public.v_airline_profile
language plpgsql volatile security definer set search_path = public as $$
declare
    v_resonant_id uuid;
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

    if v_desc is null then
        return query select * from public.v_airline_profile where uid = p_airline_uid;
        return;
    end if;

    if length(v_desc) > 4000 then
        raise exception 'A description is at most 4000 characters'
            using errcode = 'check_violation';
    end if;

    insert into public.airline_overrides (airline_uid, description_md, updated_at, updated_by)
         values (p_airline_uid, v_desc, now(), public.echo_current_resonant())
    on conflict (airline_uid) do update
       set description_md = excluded.description_md,
           updated_at     = excluded.updated_at,
           updated_by     = excluded.updated_by;

    update public.airlines a
       set description_md = v_desc
     where a.uid = p_airline_uid;

    return query select * from public.v_airline_profile where uid = p_airline_uid;
end;
$$;

comment on function public.update_claimed_airline(uuid, text) is
    'Edit the description of one airline the caller holds a claim on. Not the name any more -- that stays locked to the game data once claimed, same as for everyone else; admin_update_airline is the only remaining way to rename one.';

revoke all on function public.update_claimed_airline(uuid, text) from public, anon;
grant execute on function public.update_claimed_airline(uuid, text) to authenticated;

commit;
