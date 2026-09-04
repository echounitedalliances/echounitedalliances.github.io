-- =====================================================================
--  Echo United Alliances -- country names
--
--  The exports carry ISO 3166-1 alpha-2 codes and nothing else, and so do the
--  open airport datasets. "Registered in AE" is not a sentence anyone wants to
--  read, so this is the lookup that turns a code into a name.
--
--  Every code that appears anywhere in the network is here. Codes that turn up
--  later still work: the joins are all LEFT, and an unknown code falls back to
--  showing the code itself.
-- =====================================================================

begin;

create table if not exists public.countries (
    country_code text primary key check (country_code ~ '^[A-Z]{2}$'),
    country_name text not null,
    -- the form that reads correctly after "in" or "of": "the Netherlands",
    -- "the United States", but plain "Japan"
    the_name     text not null
);

comment on table public.countries is
    'ISO 3166-1 alpha-2 to a readable name. the_name is the form to use mid-sentence.';

insert into public.countries (country_code, country_name, the_name) values
    ('AE','United Arab Emirates','the United Arab Emirates'),
    ('AF','Afghanistan','Afghanistan'), ('AG','Antigua and Barbuda','Antigua and Barbuda'),
    ('AI','Anguilla','Anguilla'), ('AL','Albania','Albania'), ('AM','Armenia','Armenia'),
    ('AO','Angola','Angola'), ('AR','Argentina','Argentina'), ('AS','American Samoa','American Samoa'),
    ('AT','Austria','Austria'), ('AU','Australia','Australia'), ('AW','Aruba','Aruba'),
    ('AZ','Azerbaijan','Azerbaijan'), ('BA','Bosnia and Herzegovina','Bosnia and Herzegovina'),
    ('BB','Barbados','Barbados'), ('BD','Bangladesh','Bangladesh'), ('BE','Belgium','Belgium'),
    ('BF','Burkina Faso','Burkina Faso'), ('BG','Bulgaria','Bulgaria'), ('BH','Bahrain','Bahrain'),
    ('BI','Burundi','Burundi'), ('BJ','Benin','Benin'), ('BL','Saint Barthelemy','Saint Barthelemy'),
    ('BM','Bermuda','Bermuda'), ('BN','Brunei','Brunei'), ('BO','Bolivia','Bolivia'),
    ('BQ','Caribbean Netherlands','the Caribbean Netherlands'), ('BR','Brazil','Brazil'),
    ('BS','Bahamas','the Bahamas'), ('BT','Bhutan','Bhutan'), ('BW','Botswana','Botswana'),
    ('BY','Belarus','Belarus'), ('BZ','Belize','Belize'), ('CA','Canada','Canada'),
    ('CC','Cocos Islands','the Cocos Islands'), ('CD','DR Congo','the DR Congo'),
    ('CF','Central African Republic','the Central African Republic'),
    ('CG','Republic of the Congo','the Republic of the Congo'), ('CH','Switzerland','Switzerland'),
    ('CI','Cote d''Ivoire','Cote d''Ivoire'), ('CK','Cook Islands','the Cook Islands'),
    ('CL','Chile','Chile'), ('CM','Cameroon','Cameroon'), ('CN','China','China'),
    ('CO','Colombia','Colombia'), ('CR','Costa Rica','Costa Rica'), ('CU','Cuba','Cuba'),
    ('CV','Cape Verde','Cape Verde'), ('CW','Curacao','Curacao'),
    ('CX','Christmas Island','Christmas Island'), ('CY','Cyprus','Cyprus'),
    ('CZ','Czechia','Czechia'), ('DE','Germany','Germany'), ('DJ','Djibouti','Djibouti'),
    ('DK','Denmark','Denmark'), ('DM','Dominica','Dominica'),
    ('DO','Dominican Republic','the Dominican Republic'), ('DZ','Algeria','Algeria'),
    ('EC','Ecuador','Ecuador'), ('EE','Estonia','Estonia'), ('EG','Egypt','Egypt'),
    ('EH','Western Sahara','Western Sahara'), ('ER','Eritrea','Eritrea'), ('ES','Spain','Spain'),
    ('ET','Ethiopia','Ethiopia'), ('FI','Finland','Finland'), ('FJ','Fiji','Fiji'),
    ('FM','Micronesia','Micronesia'), ('FO','Faroe Islands','the Faroe Islands'),
    ('FR','France','France'), ('GA','Gabon','Gabon'),
    ('GB','United Kingdom','the United Kingdom'), ('GD','Grenada','Grenada'),
    ('GE','Georgia','Georgia'), ('GF','French Guiana','French Guiana'),
    ('GG','Guernsey','Guernsey'), ('GH','Ghana','Ghana'), ('GI','Gibraltar','Gibraltar'),
    ('GL','Greenland','Greenland'), ('GM','Gambia','the Gambia'), ('GN','Guinea','Guinea'),
    ('GP','Guadeloupe','Guadeloupe'), ('GQ','Equatorial Guinea','Equatorial Guinea'),
    ('GR','Greece','Greece'), ('GT','Guatemala','Guatemala'), ('GU','Guam','Guam'),
    ('GW','Guinea-Bissau','Guinea-Bissau'), ('GY','Guyana','Guyana'),
    ('HK','Hong Kong','Hong Kong'), ('HN','Honduras','Honduras'), ('HR','Croatia','Croatia'),
    ('HT','Haiti','Haiti'), ('HU','Hungary','Hungary'), ('ID','Indonesia','Indonesia'),
    ('IE','Ireland','Ireland'), ('IL','Israel','Israel'), ('IM','Isle of Man','the Isle of Man'),
    ('IN','India','India'), ('IQ','Iraq','Iraq'), ('IR','Iran','Iran'), ('IS','Iceland','Iceland'),
    ('IT','Italy','Italy'), ('JE','Jersey','Jersey'), ('JM','Jamaica','Jamaica'),
    ('JO','Jordan','Jordan'), ('JP','Japan','Japan'), ('KE','Kenya','Kenya'),
    ('KG','Kyrgyzstan','Kyrgyzstan'), ('KH','Cambodia','Cambodia'), ('KI','Kiribati','Kiribati'),
    ('KM','Comoros','the Comoros'), ('KN','Saint Kitts and Nevis','Saint Kitts and Nevis'),
    ('KR','South Korea','South Korea'), ('KW','Kuwait','Kuwait'),
    ('KY','Cayman Islands','the Cayman Islands'), ('KZ','Kazakhstan','Kazakhstan'),
    ('LA','Laos','Laos'), ('LB','Lebanon','Lebanon'), ('LC','Saint Lucia','Saint Lucia'),
    ('LK','Sri Lanka','Sri Lanka'), ('LR','Liberia','Liberia'), ('LS','Lesotho','Lesotho'),
    ('LT','Lithuania','Lithuania'), ('LU','Luxembourg','Luxembourg'), ('LV','Latvia','Latvia'),
    ('LY','Libya','Libya'), ('MA','Morocco','Morocco'), ('MD','Moldova','Moldova'),
    ('ME','Montenegro','Montenegro'), ('MF','Saint Martin','Saint Martin'),
    ('MG','Madagascar','Madagascar'), ('MH','Marshall Islands','the Marshall Islands'),
    ('MK','North Macedonia','North Macedonia'), ('ML','Mali','Mali'), ('MM','Myanmar','Myanmar'),
    ('MN','Mongolia','Mongolia'), ('MO','Macau','Macau'),
    ('MP','Northern Mariana Islands','the Northern Mariana Islands'),
    ('MQ','Martinique','Martinique'), ('MR','Mauritania','Mauritania'), ('MT','Malta','Malta'),
    ('MU','Mauritius','Mauritius'), ('MV','Maldives','the Maldives'), ('MW','Malawi','Malawi'),
    ('MX','Mexico','Mexico'), ('MY','Malaysia','Malaysia'), ('MZ','Mozambique','Mozambique'),
    ('NA','Namibia','Namibia'), ('NC','New Caledonia','New Caledonia'), ('NE','Niger','Niger'),
    ('NF','Norfolk Island','Norfolk Island'), ('NG','Nigeria','Nigeria'),
    ('NI','Nicaragua','Nicaragua'), ('NL','Netherlands','the Netherlands'),
    ('NO','Norway','Norway'), ('NP','Nepal','Nepal'), ('NR','Nauru','Nauru'),
    ('NZ','New Zealand','New Zealand'), ('OM','Oman','Oman'), ('PA','Panama','Panama'),
    ('PE','Peru','Peru'), ('PF','French Polynesia','French Polynesia'),
    ('PG','Papua New Guinea','Papua New Guinea'), ('PH','Philippines','the Philippines'),
    ('PK','Pakistan','Pakistan'), ('PL','Poland','Poland'),
    ('PM','Saint Pierre and Miquelon','Saint Pierre and Miquelon'),
    ('PR','Puerto Rico','Puerto Rico'), ('PT','Portugal','Portugal'), ('PW','Palau','Palau'),
    ('PY','Paraguay','Paraguay'), ('QA','Qatar','Qatar'), ('RE','Reunion','Reunion'),
    ('RO','Romania','Romania'), ('RS','Serbia','Serbia'), ('RU','Russia','Russia'),
    ('RW','Rwanda','Rwanda'), ('SA','Saudi Arabia','Saudi Arabia'),
    ('SB','Solomon Islands','the Solomon Islands'), ('SC','Seychelles','the Seychelles'),
    ('SD','Sudan','Sudan'), ('SE','Sweden','Sweden'), ('SG','Singapore','Singapore'),
    ('SH','Saint Helena','Saint Helena'), ('SI','Slovenia','Slovenia'),
    ('SK','Slovakia','Slovakia'), ('SL','Sierra Leone','Sierra Leone'), ('SN','Senegal','Senegal'),
    ('SO','Somalia','Somalia'), ('SR','Suriname','Suriname'), ('SS','South Sudan','South Sudan'),
    ('ST','Sao Tome and Principe','Sao Tome and Principe'), ('SV','El Salvador','El Salvador'),
    ('SX','Sint Maarten','Sint Maarten'), ('SY','Syria','Syria'), ('SZ','Eswatini','Eswatini'),
    ('TC','Turks and Caicos Islands','the Turks and Caicos Islands'), ('TD','Chad','Chad'),
    ('TG','Togo','Togo'), ('TH','Thailand','Thailand'), ('TJ','Tajikistan','Tajikistan'),
    ('TL','Timor-Leste','Timor-Leste'), ('TM','Turkmenistan','Turkmenistan'),
    ('TN','Tunisia','Tunisia'), ('TO','Tonga','Tonga'), ('TR','Turkiye','Turkiye'),
    ('TT','Trinidad and Tobago','Trinidad and Tobago'), ('TV','Tuvalu','Tuvalu'),
    ('TW','Taiwan','Taiwan'), ('TZ','Tanzania','Tanzania'), ('UA','Ukraine','Ukraine'),
    ('UG','Uganda','Uganda'), ('US','United States','the United States'),
    ('UY','Uruguay','Uruguay'), ('UZ','Uzbekistan','Uzbekistan'),
    ('VC','Saint Vincent and the Grenadines','Saint Vincent and the Grenadines'),
    ('VE','Venezuela','Venezuela'), ('VG','British Virgin Islands','the British Virgin Islands'),
    ('VI','U.S. Virgin Islands','the U.S. Virgin Islands'), ('VN','Vietnam','Vietnam'),
    ('VU','Vanuatu','Vanuatu'), ('WF','Wallis and Futuna','Wallis and Futuna'),
    ('WS','Samoa','Samoa'), ('XK','Kosovo','Kosovo'), ('YE','Yemen','Yemen'),
    ('YT','Mayotte','Mayotte'), ('ZA','South Africa','South Africa'), ('ZM','Zambia','Zambia'),
    ('ZW','Zimbabwe','Zimbabwe')
on conflict (country_code) do update
    set country_name = excluded.country_name,
        the_name     = excluded.the_name;

alter table public.countries enable row level security;
drop policy if exists countries_public_read on public.countries;
create policy countries_public_read on public.countries
    for select to anon, authenticated using (true);
grant select on public.countries to anon, authenticated;

-- ---------------------------------------------------------------------
-- Use them in the generated profile
-- ---------------------------------------------------------------------

create or replace function public.echo_generate_profile(p_uid uuid)
returns text language plpgsql stable as $$
declare
    a          record;
    d          record;
    home       text;
    countries  integer;
    hub_list   text;
    wide       integer;
    longest    record;
    busiest    record;
    reach      text;
    fleet_line text;
    out_text   text;
begin
    select * into a from public.mv_airline_directory where uid = p_uid;
    if not found then
        return null;
    end if;
    select * into d from public.divisions where division_code = a.division_code;

    select coalesce(c.the_name, a.airline_country) into home
      from (select 1) z
      left join public.countries c on c.country_code = a.airline_country;

    select count(distinct ap.country_code) into countries
      from public.flights f
      cross join lateral (values (f.origin_iata), (f.destination_iata)) as x(iata)
      join public.airports ap on ap.iata_code = x.iata
     where f.airline_uid = p_uid and ap.country_code is not null;

    select count(*) into wide
      from public.aircraft ac
     where ac.airline_uid = p_uid and not ac.is_placeholder
       and public.echo_is_widebody(ac.aircraft_model);

    select l.origin_iata, l.destination_iata, l.duration_minutes into longest
      from public.mv_leg_departures l
     where l.airline_uid = p_uid
     order by l.duration_minutes desc limit 1;

    select r.origin_iata, r.destination_iata, r.departures_per_week into busiest
      from public.v_routes r
     where r.airline_uid = p_uid
     order by r.departures_per_week desc limit 1;

    if a.hubs is not null and array_length(a.hubs, 1) > 0 then
        hub_list := array_to_string(a.hubs[1:least(array_length(a.hubs,1), 3)], ', ');
    end if;

    out_text := coalesce(nullif(trim(a.airline_name), ''), 'This carrier')
        || ' is a member of Echo United Alliances, flying in the '
        || d.division_name || ' division';
    if home is not null then
        out_text := out_text || ' out of ' || home;
    end if;
    out_text := out_text || '.';

    if a.routes = 0 then
        return out_text || ' It holds a fleet but has not yet filed a schedule.';
    end if;

    reach := case
        when countries >= 40 then 'a genuinely global network'
        when countries >= 15 then 'a wide international network'
        when countries >= 5  then 'an international network'
        when countries = 1   then 'a domestic network'
        else 'a regional network'
    end;

    out_text := out_text || ' From ' || coalesce(hub_list, 'its bases')
        || ' it operates ' || reach || ' of ' || a.routes || ' routes to '
        || a.destinations || ' destinations';
    if countries > 1 then
        out_text := out_text || ' across ' || countries || ' countries';
    end if;
    out_text := out_text || '.';

    -- Fleet. An all-widebody operator is a different airline from one with a
    -- handful of them, and the sentence should say so rather than reporting
    -- "271 widebodies" out of 271 aircraft.
    fleet_line := ' The fleet numbers ' || a.fleet_size || ' aircraft';
    if a.aircraft_types > 1 then
        fleet_line := fleet_line || ' across ' || a.aircraft_types || ' types';
    end if;
    if a.most_common_aircraft is not null then
        fleet_line := fleet_line || ', built around the ' || a.most_common_aircraft;
    end if;
    if a.fleet_size > 0 and wide = a.fleet_size then
        fleet_line := fleet_line || ', widebodies throughout';
    elsif wide > 0 then
        fleet_line := fleet_line || ', including ' || wide
            || case when wide = 1 then ' widebody' else ' widebodies' end
            || ' for the long-haul work';
    end if;
    out_text := out_text || fleet_line || '.';

    if longest.origin_iata is not null and longest.duration_minutes >= 480 then
        out_text := out_text || ' Its longest sector, ' || longest.origin_iata
            || ' to ' || longest.destination_iata || ', blocks at '
            || (longest.duration_minutes / 60) || 'h '
            || lpad((longest.duration_minutes % 60)::text, 2, '0') || 'm.';
    elsif busiest.origin_iata is not null and busiest.departures_per_week >= 7 then
        out_text := out_text || ' Its busiest sector, ' || busiest.origin_iata
            || ' to ' || busiest.destination_iata || ', runs '
            || busiest.departures_per_week || ' times a week.';
    end if;

    return out_text;
end;
$$;

commit;
