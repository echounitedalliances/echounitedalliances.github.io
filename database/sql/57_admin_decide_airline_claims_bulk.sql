-- =====================================================================
--  Echo United Alliances -- deciding several airline claims at once
--
--  admin_decide_airline_claim (54_airline_claims.sql) takes one claim_id.
--  Fine when the queue is short; tedious the moment it is not -- an admin
--  clearing a backlog of a dozen straightforward claims had to click
--  Approve, wait, click again, a dozen times over. This adds the batch
--  form of the same operation: same checks, same effect per claim, just
--  looped, so AdminAirlineClaims.tsx can let an admin tick several rows
--  and decide them together.
--
--  WHY A SKIPPED CLAIM DOES NOT FAIL THE WHOLE BATCH
--
--  admin_decide_airline_claim raises if the claim is not pending any more
--  (already decided, typically by a second admin looking at the same
--  queue). Raising there is fine -- it is one claim, the admin just opened
--  it. Raising here would mean one claim another admin got to first costs
--  the ADMIN'S ENTIRE BATCH its results, with no way to tell afterwards
--  which of the other eleven went through. So a claim that is not pending
--  when its turn comes is skipped, not fatal: it comes back in the result
--  set with its actual (unchanged) status rather than stopping the loop.
-- =====================================================================

begin;

create or replace function public.admin_decide_airline_claims_bulk(
    p_claim_ids bigint[],
    p_approve   boolean,
    p_note      text default null
)
returns table (
    claim_id   bigint,
    status     text,
    decided_at timestamptz,
    decided_by text,
    skipped    boolean
)
language plpgsql volatile security definer set search_path = public as $$
declare
    v_claim public.airline_claims;
    v_actor text;
    v_note  text := nullif(btrim(coalesce(p_note, '')), '');
    v_id    bigint;
begin
    if not public.echo_is_admin() then
        raise exception 'Only an alliance admin may decide an airline claim'
            using errcode = 'insufficient_privilege';
    end if;

    if p_claim_ids is null or cardinality(p_claim_ids) = 0 then
        raise exception 'No claims were selected.' using errcode = 'invalid_parameter_value';
    end if;

    select r.email into v_actor from public.resonants r
     where r.user_id = public.echo_current_user_id();

    -- Oldest first, so a backlog is cleared in the order it queued, and
    -- duplicates in the input do not decide the same claim twice.
    for v_id in
        select distinct c.claim_id from unnest(p_claim_ids) as c(claim_id) order by c.claim_id
    loop
        select * into v_claim from public.airline_claims
         where public.airline_claims.claim_id = v_id
           for update;

        if not found or v_claim.status <> 'pending' then
            -- Not found: a bad id was passed, same as it never existed.
            -- Not pending: someone else already decided it. Either way,
            -- report it rather than touching it.
            return query
                select v_id, coalesce(v_claim.status, 'not_found'), v_claim.decided_at,
                       v_claim.decided_by, true;
            continue;
        end if;

        if p_approve then
            update public.resonants
               set claimed_airline_uid = v_claim.airline_uid, updated_at = now()
             where resonant_id = v_claim.resonant_id;
        end if;

        update public.airline_claims c
           set status        = case when p_approve then 'approved' else 'rejected' end,
               decided_at     = now(),
               decided_by     = v_actor,
               decision_note  = v_note
         where c.claim_id = v_id;

        return query
            select c.claim_id, c.status, c.decided_at, c.decided_by, false
              from public.airline_claims c where c.claim_id = v_id;
    end loop;
end;
$$;

comment on function public.admin_decide_airline_claims_bulk(bigint[], boolean, text) is
    'Approve or turn down several claims in one call, same effect per claim as admin_decide_airline_claim. A claim that is no longer pending by the time its turn comes is skipped (skipped = true) rather than failing the rest of the batch.';

revoke all on function public.admin_decide_airline_claims_bulk(bigint[], boolean, text) from public, anon;
grant execute on function public.admin_decide_airline_claims_bulk(bigint[], boolean, text) to authenticated;

commit;
