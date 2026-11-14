// The phenomena a visitor can toggle with the checkboxes at the bottom of the page.
// `meteomatics` lists the parameters the API proxy is allowed to request for that layer
// (the server rejects anything not listed here).
// `nisar` names the radar measurement from scripts/analyze-nisar.js that tells the story.

export const LAYERS = {
  flooding: {
    id: 'flooding',
    label: 'Flooding',
    icon: '💧',
    color: '#38bdf8',
    simple:
      'Calm, open water acts like a mirror. It bounces the radar signal away from the satellite, so flooded ground looks dark. When more of an area turns dark, more of it is under water.',
    radarHow:
      'We count the share of radar pixels that are dark in both HH and HV polarizations. Under trees and mangroves, flood water does the opposite: radar bounces between the water and the trunks (a "double bounce"), so flooded forest looks extra bright in HH.',
    nisar: { key: 'water', label: 'Area that looks like open water', unit: '%' },
    meteomatics: [
      { param: 'precip_24h:mm', label: 'Rain in the last 24 hours', unit: 'mm' },
      { param: 'soil_moisture_index_-15cm:idx', label: 'Soil wetness (0 = dry, 1 = soaked)', unit: '' },
    ],
  },
  deforestation: {
    id: 'deforestation',
    label: 'Deforestation',
    icon: '🌳',
    color: '#4ade80',
    simple:
      'Leaves and branches scatter radar in every direction, like a disco ball. That scrambling shows up in the HV polarization. When plants are cut down or die, the HV signal drops.',
    radarHow:
      'NISAR uses L-band radar (24 cm wavelength). It passes through leaves and bounces off branches and trunks, so it measures woody plants better than short-wavelength radars. We track the share of pixels where the cross-polarized (HV) signal dominates.',
    nisar: { key: 'vegetation', label: 'Area that looks like vegetation', unit: '%' },
    meteomatics: [
      { param: 'evapotranspiration_24h:mm', label: 'Water plants "breathed out" (24 h)', unit: 'mm' },
      { param: 'soil_moisture_index_-15cm:idx', label: 'Soil wetness (0 = dry, 1 = soaked)', unit: '' },
    ],
  },
  fires: {
    id: 'fires',
    label: 'Fires',
    icon: '🔥',
    color: '#f97316',
    simple:
      'Hot, dry, windy days make fires more likely. After a fire, burned plants scatter less radar, so the vegetation signal dips. In the Everglades, fire is natural and helps the sawgrass regrow.',
    radarHow:
      'A sudden drop in HV backscatter between two 12-day NISAR passes can mark a burn scar. Radar sees through smoke and clouds, so it works even while a fire is burning.',
    nisar: { key: 'vegetation', label: 'Area that looks like vegetation', unit: '%' },
    meteomatics: [
      { param: 't_max_2m_24h:C', label: 'Hottest temperature of the day', unit: '°C' },
      { param: 'relative_humidity_2m:p', label: 'Humidity', unit: '%' },
      { param: 'wind_gusts_10m_24h:ms', label: 'Strongest wind gust', unit: 'm/s' },
    ],
  },
  smog: {
    id: 'smog',
    label: 'Pollution / Smog',
    icon: '🌫️',
    color: '#a78bfa',
    simple:
      'Smog is made of tiny particles and gases from cars, ships and factories. Radar cannot see it, because radar waves pass straight through air. That is why we pair NISAR with air quality data from the Meteomatics API.',
    radarHow:
      'Radar is an all-weather sensor: clouds, haze and smoke are invisible to it. NISAR shows where the city is (bright, "built-up" pixels). The air quality numbers show what that city puts into the air.',
    nisar: { key: 'bright', label: 'Area that looks built-up (very bright)', unit: '%' },
    meteomatics: [
      { param: 'air_quality:idx', label: 'Air quality (0 Good to 5 Extremely Poor)', unit: '' },
      { param: 'pm2p5:ugm3', label: 'Fine particles (PM2.5)', unit: 'µg/m³' },
      { param: 'o3:ugm3', label: 'Ozone near the ground', unit: 'µg/m³' },
      { param: 'no2:ugm3', label: 'Nitrogen dioxide (traffic)', unit: 'µg/m³' },
    ],
  },
  lights: {
    id: 'lights',
    label: 'Light Pollution',
    icon: '💡',
    color: '#facc15',
    simple:
      'At night, satellites can photograph city lights. Bright skies hide the stars and confuse sea turtles and migrating birds. NASA\'s Black Marble images show how much light each place gives off.',
    radarHow:
      'NISAR does not see light. NASA\'s Black Marble (VIIRS Day/Night Band) does. We put the two side by side: bright radar (buildings) usually means bright lights.',
    nisar: { key: 'bright', label: 'Area that looks built-up (very bright)', unit: '%' },
    blackMarble: true,
    meteomatics: [],
  },
};

export const LAYER_IDS = Object.keys(LAYERS);

// Every Meteomatics parameter the proxy may request.
export const ALLOWED_PARAMS = [...new Set(Object.values(LAYERS).flatMap((l) => l.meteomatics.map((m) => m.param)))];
