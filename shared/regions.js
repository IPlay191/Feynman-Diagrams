// The three study areas. Shared by the API server, the data scripts and the website.
// Polygons are hand-drawn approximations ([lon, lat] order, as GeoJSON expects).

export const REGIONS = {
  downtown: {
    id: 'downtown',
    name: 'Downtown Miami',
    tagline: 'A city that glows and breathes',
    color: [245, 166, 35], // orange
    point: { lat: 25.7743, lon: -80.1937 },
    camera: { center: [-80.1935, 25.7735], zoom: 13.6, pitch: 50, bearing: -20 },
    polygon: [
      [-80.2030, 25.7890], [-80.1865, 25.7895], [-80.1858, 25.7745],
      [-80.1885, 25.7595], [-80.1975, 25.7570], [-80.2045, 25.7680],
      [-80.2030, 25.7890],
    ],
    intro:
      'Downtown and Brickell are packed with skyscrapers, roads and people. Radar bounces straight back off buildings, so the city shows up very bright. We watch the air people breathe, the light the city gives off at night, and how often streets flood.',
  },
  miamibeach: {
    id: 'miamibeach',
    name: 'Miami Beach',
    tagline: 'An island under pressure',
    color: [56, 189, 248], // cyan
    point: { lat: 25.8100, lon: -80.1300 },
    camera: { center: [-80.1330, 25.8150], zoom: 12.4, pitch: 50, bearing: -15 },
    polygon: [
      [-80.1445, 25.7650], [-80.1295, 25.7630], [-80.1225, 25.7900],
      [-80.1185, 25.8300], [-80.1180, 25.8730], [-80.1265, 25.8735],
      [-80.1330, 25.8350], [-80.1395, 25.8000], [-80.1445, 25.7650],
    ],
    intro:
      'Miami Beach is a thin barrier island between Biscayne Bay and the Atlantic Ocean. Much of it sits only 1 to 2 meters above sea level, so king tides and heavy rain can push water into the streets.',
  },
  everglades: {
    id: 'everglades',
    name: 'Everglades',
    tagline: 'The river of grass',
    color: [74, 222, 128], // green
    point: { lat: 25.5000, lon: -80.8000 },
    camera: { center: [-80.8200, 25.4800], zoom: 9.2, pitch: 45, bearing: -10 },
    polygon: [
      [-81.2600, 25.8000], [-80.8700, 25.8600], [-80.5000, 25.7600],
      [-80.4400, 25.5500], [-80.5200, 25.3600], [-80.6500, 25.2200],
      [-80.9000, 25.1500], [-81.1200, 25.3000], [-81.2800, 25.5500],
      [-81.2600, 25.8000],
    ],
    intro:
      'The Everglades is a huge, slow-moving wetland of sawgrass, mangroves and cypress. Water levels rise in the wet season (June to October) and fall in the dry season. Fires are a natural part of its life, and they get more likely when it is dry.',
  },
};

export const REGION_IDS = Object.keys(REGIONS);

// Whole map view of South Florida
export const OVERVIEW_CAMERA = { center: [-80.55, 25.55], zoom: 8.6, pitch: 40, bearing: -12 };

export function regionBBox(id) {
  const pts = REGIONS[id].polygon;
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

export function pointInPolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
