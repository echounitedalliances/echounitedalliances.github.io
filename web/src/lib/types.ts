/** Shapes returned by the views and RPCs in database/sql/09_site_api.sql. */

export type Division = {
  division_code: string
  division_name: string
  sort_order: number
  accent_color: string | null
  alliance_description: string | null
  created_time: string | null
  carriers: number
  aircraft: number
  flight_pairs: number
  routes: number
  destinations: number
  top_hubs: string[] | null
}

export type Airline = {
  uid: string
  division_code: string
  division_name: string
  accent_color: string | null
  airline_slug: string
  carrier_code: string
  airline_code: string | null
  airline_name: string | null
  airline_country: string | null
  is_division_leader: boolean
  website_url: string | null
  booking_url: string | null
  description_md: string | null
  fleet_size: number
  aircraft_types: number
  most_common_aircraft: string | null
  flight_pairs: number
  routes: number
  destinations: number
  hub_count: number
  hubs: string[] | null
  cheapest_economy_usd: number | null
  prominence: number
  /** Only on v_airline_profile: generated from the schedule, or hand-written. */
  description?: string | null
  description_is_custom?: boolean
}

export type TimetableRow = {
  flight_designator: string
  origin_iata: string
  destination_iata: string
  departure_time: string
  arrival_time: string
  arrival_days_after: number
  duration_minutes: number
  aircraft_model: string | null
  days: number[]
  economy_price: number | null
  business_price: number | null
}

export type AirportRoute = {
  origin_iata: string
  destination_iata: string
  origin_lat: number
  origin_lon: number
  dest_lat: number
  dest_lon: number
  division_code: string | null
  accent_color: string
  carriers: number
  weekly_departures: number
  city_name: string | null
}

export type AirportRow = {
  iata_code: string
  airport_name: string | null
  city_name: string | null
  country_code: string | null
  latitude: number | null
  longitude: number | null
  timezone: string | null
  out_degree: number
  in_degree: number
  weekly_departures: number
  carriers: number
  hub_for: number
}

export type Arc = {
  origin_iata: string
  destination_iata: string
  division_code: string | null
  weekly_departures: number
  carriers: number
  origin_lat: number
  origin_lon: number
  dest_lat: number
  dest_lon: number
  accent_color: string
}

export type NetworkNode = {
  iata_code: string
  city_name: string | null
  country_code: string | null
  latitude: number
  longitude: number
  weekly_departures: number
  carriers: number
  hub_for: number
}

export type Leg = {
  flight_id: string
  aircraft_id: string
  /** OUTBOUND or INBOUND: a flight pair sells in both directions. */
  direction: 'OUTBOUND' | 'INBOUND'
  designator: string
  carrier_code: string
  division: string
  origin: string
  destination: string
  departure_date: string
  departure_time: string
  arrival_date: string
  arrival_time: string
  duration_minutes: number
  price_usd: number
  aircraft_model: string | null
}

export type Itinerary = {
  stops: number
  via: string[]
  total_price_usd: number
  total_minutes: number
  carriers: string[]
  divisions: string[]
  is_interline: boolean
  legs: Leg[]
}

export type FleetRow = {
  aircraft_model: string
  manufacturer: string | null
  aircraft_count: number
}

/**
 * One city pair, both directions folded together.
 *
 * The carrier page used to read v_routes, which is one row per DIRECTED pair,
 * and so listed LHR -> JFK and JFK -> LHR as two routes each carrying half the
 * traffic. directions is 1 or 2; when it is 1, sole_origin is the end it
 * departs from.
 */
export type RoutePairRow = {
  airport_a: string
  airport_b: string
  departures_per_week: number
  directions: number
  sole_origin: string
  fastest_minutes: number
  cheapest_economy_usd: number | null
}

export type BookingDetails = {
  booking_id: string
  pnr: string
  status: string
  total_amount_usd: string | number
  currency: string
  contact_email: string
  contact_name: string | null
  created_at: string
  passenger_count: number
  passengers: { seq: number; type: string; given_name: string; family_name: string }[] | null
  segments:
    | {
        seq: number
        designator: string
        carrier: string
        origin: string
        destination: string
        travel_date: string
        departure_time: string
        arrival_time: string
        arrival_days_after: number
        cabin: string
        price_usd: number
      }[]
    | null
  divisions: string[] | null
}

export const CABINS = [
  { code: 'ECONOMY', label: 'Economy' },
  { code: 'PREMIUM_ECONOMY', label: 'Premium Economy' },
  { code: 'BUSINESS', label: 'Business' },
  { code: 'FIRST', label: 'First' },
] as const

export type BoardDeparture = {
  /** The real instant of the next occurrence, so the client can render it
   *  in the viewer's own zone. The board used to get only a bare clock
   *  string, which is unconvertible. */
  departs_at: string
  /** The origin airport's own clock, kept for reference. */
  departure_local: string
  origin_tz: string
  origin_iata: string
  origin_city: string
  flight_designator: string
  destination_iata: string
  destination_city: string
  carrier_code: string
  airline_name: string | null
  division_code: string
  accent_color: string
}

/**
 * One airport, plus the city it is grouped under.
 *
 * place_airports is how many airports that city has, which is what tells the
 * typeahead whether to draw a "London — all airports" heading over them.
 */
export type PlaceRow = {
  iata_code: string
  airport_name: string | null
  city_name: string | null
  country_code: string | null
  latitude: number | null
  longitude: number | null
  weekly_departures: number
  carriers: number
  place_key: string
  place_name: string
  place_airports: number
  place_rank: number
}
