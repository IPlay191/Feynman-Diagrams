// What we saw in the data (Nov 2025 - Oct 2026) and our best guess at WHY.
// Numbers come from public/data/nisar.json, public/data/lights.json and the Meteomatics API.
// "saw" = observation, "why" = our hypothesis about the physical driver.

export const INSIGHTS = {
  everglades: {
    flooding: {
      saw: 'From November to August, about 8% of the Everglades looked like open water to NISAR. In September and October 2026 that jumped to 16-20%. Meteomatics shows 305 mm of rain in September and soil wetness near 1.0 (soaked).',
      why: 'This is the wet season. Summer storms fill the "river of grass" until water pools above the sawgrass, and calm water reflects radar away from the satellite. Water managers can also send water south from Lake Okeechobee through canals and gates.',
    },
    deforestation: {
      saw: 'The area that looks like vegetation went from 58% in November to 66-69% between February and May, then fell back to about 53% by late October.',
      why: 'Little forest is being cut here. The swing follows the seasons: in the dry season the sawgrass marsh dries out and its plants scatter radar like vegetation, and in the wet season the water underneath turns them into mirror-like water or "double-bounce" bright spots. Watch HV radar over the mangroves after hurricanes, when real tree damage would show up.',
    },
    fires: {
      saw: 'The dry season (Nov-May) had almost no rain (7-14 mm per month in Nov-Feb) and soil wetness fell to 0.33 in April. Over the same months a growing share of the Everglades turned darker than in November (up to 22% of the area by May).',
      why: 'Dry sawgrass burns easily, and prescribed burns and lightning fires happen mostly in spring. Burned or dried-out plants scatter less radar, which could explain part of the darkening. Radar sees through smoke, so NISAR can track burn scars even while a fire is still smoking.',
    },
    smog: {
      saw: 'The Everglades has the cleanest air of our three places: PM2.5 averaged 4-7 µg/m³ in the winter and NO₂ stayed around 2-5 µg/m³. Fine particles rose to about 10 µg/m³ from June to August.',
      why: 'Few roads and no factories means little NO₂. The summer bump in particles shows up in all three places. It is most likely Saharan dust blowing across the Atlantic, which reaches Florida every summer.',
    },
    lights: {
      saw: 'Black Marble shows the Everglades nearly dark, at about 8 on our 0-100 brightness scale in both 2012 and 2016, while Downtown sits near 100.',
      why: 'No cities means a dark sky, which matters for nocturnal wildlife. Single brighter nights in the daily data are likely moonlit clouds, lightning or fires rather than new lights.',
    },
  },
  miamibeach: {
    flooding: {
      saw: 'Miami Beach got 330 mm of rain in May 2026 (106 mm on May 29 alone) and 386 mm in September. NISAR\'s "open water" share inside the island stayed small (6-8%) on every pass.',
      why: 'Streets flood for hours, but NISAR passes only every 12 days, at 10:44 UTC (around sunrise in Miami), so it usually misses the peak. Pumps and drains also clear the water fast. To catch street floods you would need NISAR\'s faster-revisit modes, or flood maps made right after a storm.',
    },
    deforestation: {
      saw: 'The share of the island that looks like vegetation slowly fell from 31% to 23%, and the bright "built-up" share rose from 61% to 71%.',
      why: 'One possible driver is construction and taller buildings replacing trees and open lots. Another is seasonal changes in palm canopies and wet ground. A single year is too short to be sure. The pattern is worth watching over NISAR\'s full mission.',
    },
    fires: {
      saw: 'Fire weather stayed mild. Afternoon highs reached about 33 °C in July and August, and humidity rarely fell below 78%.',
      why: 'A small island surrounded by water, with irrigated lawns, rarely burns. In Miami Beach the main heat risk is to people (heat stress), not wildfire.',
    },
    smog: {
      saw: 'NO₂ was highest in December to February (about 10 µg/m³) and lowest in summer (about 5). The air quality index reached "Poor" (3) on some summer days, when fine particles rose to about 12-13 µg/m³.',
      why: 'Winter brings more tourist traffic, and calm, cool air traps exhaust near the ground. In summer, sea breezes and storms clean out NO₂, but Saharan dust adds particles.',
    },
    lights: {
      saw: 'Night brightness rose from about 79 (2012) to 91 (2016), and daily Black Marble images now read about 98-100 on our scale.',
      why: 'More hotels, condos and LED lighting along the beach. Artificial light on the beach is a known problem for sea turtle hatchlings, which crawl toward the brightest horizon.',
    },
  },
  downtown: {
    flooding: {
      saw: 'Downtown got 428 mm of rain in September 2026, and its soil wetness reached 0.99. NISAR showed 0% open water: every radar pixel stayed bright.',
      why: 'Buildings and streets create a "double bounce": radar hits the ground, then a wall, then returns to the satellite. That signal is so strong it hides shallow street flooding. Downtown flooding is better studied with NISAR\'s interferometry products (land sinking) and tide data.',
    },
    deforestation: {
      saw: 'Almost no pixels in Downtown looked like vegetation, because the city is solid concrete and glass to the radar.',
      why: 'At 200 m resolution, street trees and small parks are mixed with buildings and get drowned out. Full-resolution NISAR data (as fine as 10 m) could map Downtown\'s tree canopy.',
    },
    fires: {
      saw: 'Highs averaged 31-33 °C from June to September, the hottest of our three places on many days.',
      why: 'Concrete and asphalt store heat (the urban heat island). Wildfire risk is low, but heat risk for people is high.',
    },
    smog: {
      saw: 'Downtown had the most traffic pollution: NO₂ reached about 10-11 µg/m³ in winter. Ozone peaked in April (63 µg/m³ on average), and the air quality index hit "Poor" (3) on some April and summer days.',
      why: 'Cars, buses, cruise ships at PortMiami and construction release NO₂ and particles. Spring sunshine turns those gases into ozone. Radar cannot see smog, but it shows exactly where the city (the source) is.',
    },
    lights: {
      saw: 'Downtown is the brightest place in our study area. It already measured 95 in 2012 and has stayed at the top of the scale (about 99-100) ever since.',
      why: 'Skyscrapers, streets, the port and bridges are lit all night. The sensor is "maxed out" here, so the brightness spreading outward to the neighborhoods tells the change story better.',
    },
  },
};

export const FUTURE = [
  'Ground sinking (subsidence): NISAR\'s interferometry products (GUNW) can measure millimeters of ground motion. That could track sinking buildings and coastal land in Miami Beach.',
  'Mangrove and coral coast health: L-band HV radar measures woody biomass, so NISAR could track mangrove loss and recovery after hurricanes.',
  'Flood response: NISAR sees through clouds day and night, so emergency managers can map flooding during storms, when cameras on other satellites only see clouds.',
  'Everglades restoration: tracking the wet-season "sheet flow" of water across the marsh every 12 days helps measure whether restoration projects are working.',
];
