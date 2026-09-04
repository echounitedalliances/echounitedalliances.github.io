-- =====================================================================
--  Echo United Alliances -- seat inventory and background demand
--
--  Two things share one table. departure_inventory holds, per departure and
--  cabin, how many seats exist, how many the simulation has notionally sold,
--  and how many real bookings have taken. Availability is what is left.
--
--  The simulation exists so a 341,710-flight network does not look untouched:
--  searches show varying availability rather than every cabin permanently
--  empty. It is deliberately GENTLE -- see echo_demand_rate below -- and a
--  real booking always takes simulated seats back before it is refused, so
--  scenery can never block a customer.
-- =====================================================================

begin;

create table if not exists public.departure_inventory (
    flight_id            uuid not null references public.flights (flight_id) on delete cascade,
    aircraft_id          uuid not null references public.aircraft (aircraft_id) on delete cascade,
    direction            text not null check (direction in ('OUTBOUND', 'INBOUND')),
    travel_date          date not null,
    cabin_code           text not null references public.cabin_classes (cabin_code),

    capacity_seats       integer not null check (capacity_seats >= 0),
    simulated_seats_sold integer not null default 0 check (simulated_seats_sold >= 0),
    booked_seats         integer not null default 0 check (booked_seats >= 0),
    price_usd            integer not null default 0 check (price_usd >= 0),
    demand_rate_per_hour numeric(8,4) not null default 0 check (demand_rate_per_hour >= 0),

    seeded_at            timestamptz not null default now(),
    last_simulated_at    timestamptz,
    sold_out_at          timestamptz,

    primary key (flight_id, aircraft_id, direction, travel_date, cabin_code),
    constraint departure_inventory_not_oversold
        check (simulated_seats_sold + booked_seats <= capacity_seats)
);

comment on table public.departure_inventory is
    'Seats on one departure in one cabin. Rows are created on demand -- seeding all 3.6M weekly departures for a rolling window would be tens of millions of rows for no benefit.';

create index if not exists departure_inventory_date_idx on public.departure_inventory (travel_date);
create index if not exists departure_inventory_flight_idx
    on public.departure_inventory (flight_id, travel_date);

-- Stable pseudo-random number in [0,1) from a key, so a given departure always
-- gets the same demand profile without storing a seed.
create or replace function public.echo_hash01(p_key text)
returns numeric language sql immutable parallel safe as $$
    select (('x' || substr(md5(p_key), 1, 8))::bit(32)::bigint % 100000)::numeric / 100000.0;
$$;

-- How fast a departure fills, in seats per hour.
--
-- Tuned DOWN deliberately. A rate that fills a cabin over a few days looks
-- dramatic but leaves most of the network sold out, which is worse than
-- static: the point is variety, not scarcity. At these numbers a typical
-- departure drifts to roughly a third full over a month and the spread
-- between quiet and busy flights is what shows.
create or replace function public.echo_demand_rate(p_key text, p_capacity integer)
returns numeric language sql immutable parallel safe as $$
    select round(
        (p_capacity::numeric / 1400.0)              -- bigger cabins sell faster
        * (0.35 + public.echo_hash01(p_key) * 1.15) -- but each flight has its own luck
    , 4);
$$;

comment on function public.echo_demand_rate(text, integer) is
    'Seats per hour a departure sells on its own. Kept low on purpose: the simulation is there to make availability vary, not to sell the network out.';

-- Bookings cluster near departure. Multiplier on the base rate by days out.
create or replace function public.echo_demand_curve(p_days_out integer)
returns numeric language sql immutable parallel safe as $$
    select case
        when p_days_out < 0   then 0
        when p_days_out <= 3  then 1.8
        when p_days_out <= 10 then 1.3
        when p_days_out <= 30 then 0.8
        when p_days_out <= 90 then 0.4
        else 0.15
    end;
$$;

-- Create the inventory row for one departure if it does not exist yet.
create or replace function public.echo_seed_departure(
    p_flight_id uuid, p_aircraft_id uuid, p_direction text,
    p_travel_date date, p_cabin text
)
returns void language sql volatile as $$
    insert into public.departure_inventory (
        flight_id, aircraft_id, direction, travel_date, cabin_code,
        capacity_seats, price_usd, demand_rate_per_hour)
    select p_flight_id, p_aircraft_id, p_direction, p_travel_date, p_cabin,
           fr.seats_per_departure, fr.price_usd,
           public.echo_demand_rate(
               p_flight_id::text || p_direction || p_cabin || p_travel_date::text,
               fr.seats_per_departure)
      from public.flight_assignments fa
      cross join lateral (values
          ('ECONOMY',         fa.eco_price,      fa.eco_seats),
          ('PREMIUM_ECONOMY', fa.prem_eco_price, fa.prem_eco_seats),
          ('BUSINESS',        fa.biz_price,      fa.biz_seats),
          ('FIRST',           fa.first_price,    fa.first_seats)
      ) as fr(cabin_code, price_usd, seats_per_departure)
     where fa.flight_id = p_flight_id
       and fa.aircraft_id = p_aircraft_id
       and fr.cabin_code = p_cabin
    on conflict do nothing;
$$;

-- Advance the simulation on rows that already exist. Safe to call on a
-- schedule; it only ever moves seats from "available" to "simulated sold".
create or replace function public.simulate_bookings(p_max_rows integer default 5000)
returns integer language plpgsql volatile as $$
declare
    v_updated integer;
begin
    with due as (
        select flight_id, aircraft_id, direction, travel_date, cabin_code,
               capacity_seats, simulated_seats_sold, booked_seats,
               demand_rate_per_hour,
               extract(epoch from (now() - coalesce(last_simulated_at, seeded_at)))
                   / 3600.0 as hours_elapsed,
               (travel_date - current_date) as days_out
          from public.departure_inventory
         where travel_date >= current_date
           and simulated_seats_sold + booked_seats < capacity_seats
           and coalesce(last_simulated_at, seeded_at) < now() - interval '1 hour'
         order by last_simulated_at nulls first
         limit greatest(p_max_rows, 1)
    ),
    calc as (
        select d.*,
               least(
                   floor(d.hours_elapsed * d.demand_rate_per_hour
                         * public.echo_demand_curve(d.days_out))::integer,
                   d.capacity_seats - d.simulated_seats_sold - d.booked_seats
               ) as sell
          from due d
    )
    update public.departure_inventory di
       set simulated_seats_sold = di.simulated_seats_sold + greatest(c.sell, 0),
           last_simulated_at = now(),
           sold_out_at = case
               when di.simulated_seats_sold + greatest(c.sell, 0) + di.booked_seats
                    >= di.capacity_seats then now() else di.sold_out_at end
      from calc c
     where di.flight_id = c.flight_id and di.aircraft_id = c.aircraft_id
       and di.direction = c.direction and di.travel_date = c.travel_date
       and di.cabin_code = c.cabin_code;

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.simulate_bookings(integer) is
    'Advance background demand. Call from a scheduled job; each row moves at most once an hour.';

-- Seats a customer can still buy. Falls back to the schedule's own allotment
-- for departures that have never been touched, which is most of them.
create or replace function public.echo_available_seats(
    p_flight_id uuid, p_aircraft_id uuid, p_direction text,
    p_travel_date date, p_cabin text
)
returns integer language sql stable as $$
    select coalesce(
        (select di.capacity_seats - di.simulated_seats_sold - di.booked_seats
           from public.departure_inventory di
          where di.flight_id = p_flight_id and di.aircraft_id = p_aircraft_id
            and di.direction = p_direction and di.travel_date = p_travel_date
            and di.cabin_code = p_cabin),
        (select case p_cabin
                    when 'ECONOMY'         then fa.eco_seats
                    when 'PREMIUM_ECONOMY' then fa.prem_eco_seats
                    when 'BUSINESS'        then fa.biz_seats
                    when 'FIRST'           then fa.first_seats
                end
           from public.flight_assignments fa
          where fa.flight_id = p_flight_id and fa.aircraft_id = p_aircraft_id),
        0);
$$;

-- When a real segment is sold, take the seats. Simulated seats give way first,
-- so a real customer is never blocked by scenery.
create or replace function public.echo_segment_take_inventory()
returns trigger language plpgsql as $$
declare
    v_seats     integer;
    v_give_back integer;
    v_free      integer;
begin
    select greatest(count(*), 1) into v_seats
      from public.passengers p where p.booking_id = new.booking_id;

    perform public.echo_seed_departure(new.flight_id, new.aircraft_id,
                                       new.direction, new.travel_date, new.cabin_code);

    select capacity_seats - simulated_seats_sold - booked_seats,
           greatest(0, v_seats - (capacity_seats - simulated_seats_sold - booked_seats))
      into v_free, v_give_back
      from public.departure_inventory
     where flight_id = new.flight_id and aircraft_id = new.aircraft_id
       and direction = new.direction and travel_date = new.travel_date
       and cabin_code = new.cabin_code
       for update;

    if v_free is null then
        return new;   -- no fare row for this cabin; nothing to decrement
    end if;

    update public.departure_inventory
       set simulated_seats_sold = greatest(0, simulated_seats_sold - v_give_back),
           booked_seats = booked_seats + v_seats,
           sold_out_at = case
               when greatest(0, simulated_seats_sold - v_give_back)
                    + booked_seats + v_seats >= capacity_seats
               then now() else sold_out_at end
     where flight_id = new.flight_id and aircraft_id = new.aircraft_id
       and direction = new.direction and travel_date = new.travel_date
       and cabin_code = new.cabin_code;

    return new;
end;
$$;

comment on function public.echo_segment_take_inventory() is
    'Decrements real inventory when a segment is sold. FOR UPDATE serialises concurrent sales on the same departure, and the not-oversold check is the backstop.';

drop trigger if exists booking_segments_take_inventory on public.booking_segments;
create trigger booking_segments_take_inventory
    after insert on public.booking_segments
    for each row execute function public.echo_segment_take_inventory();

-- Give the seats back when a booking is cancelled.
create or replace function public.echo_segment_release_inventory()
returns trigger language plpgsql as $$
declare
    v_seats integer;
begin
    select greatest(count(*), 1) into v_seats
      from public.passengers p where p.booking_id = old.booking_id;

    update public.departure_inventory
       set booked_seats = greatest(0, booked_seats - v_seats),
           sold_out_at = null
     where flight_id = old.flight_id and aircraft_id = old.aircraft_id
       and direction = old.direction and travel_date = old.travel_date
       and cabin_code = old.cabin_code;
    return old;
end;
$$;

drop trigger if exists booking_segments_release_inventory on public.booking_segments;
create trigger booking_segments_release_inventory
    after delete on public.booking_segments
    for each row execute function public.echo_segment_release_inventory();

-- ---------------------------------------------------------------------
-- Reporting
-- ---------------------------------------------------------------------

create or replace view public.v_departure_load
with (security_invoker = on) as
select
    di.flight_id, di.aircraft_id, di.direction, di.travel_date, di.cabin_code,
    a.carrier_code, a.airline_name, a.division_code,
    f.origin_iata, f.destination_iata,
    di.capacity_seats, di.simulated_seats_sold, di.booked_seats,
    di.capacity_seats - di.simulated_seats_sold - di.booked_seats as seats_available,
    case when di.capacity_seats = 0 then 0
         else round(100.0 * (di.simulated_seats_sold + di.booked_seats)
                    / di.capacity_seats, 1) end as load_factor_pct,
    di.price_usd, di.sold_out_at
from public.departure_inventory di
join public.flights  f on f.flight_id = di.flight_id
join public.airlines a on a.uid = f.airline_uid;

create or replace view public.v_alliance_sales
with (security_invoker = on) as
select
    a.division_code, a.carrier_code, a.airline_name,
    count(distinct s.booking_id)         as bookings,
    count(*)                             as segments_sold,
    sum(s.price_usd)                     as revenue_usd
from public.booking_segments s
join public.airlines a on a.uid = s.operating_airline_uid
join public.bookings b on b.booking_id = s.booking_id and b.status <> 'CANCELLED'
group by a.division_code, a.carrier_code, a.airline_name;

commit;
