// Every resource the project uses, and what we used it for. Rendered in the "Data sources" panel.
export const SOURCES = [
  {
    group: 'Radar data (NISAR)',
    items: [
      {
        name: 'ASF Data Search Vertex',
        url: 'https://search.asf.alaska.edu/',
        used: 'Found the NISAR scenes over Miami. Our script uses the ASF Search API (the engine behind Vertex) to list every L2 GCOV product on track 47, frames 14 and 15, and downloads their browse images with an Earthdata Login.',
      },
      {
        name: 'NASA Earthdata Search',
        url: 'https://search.earthdata.nasa.gov/search?q=NISAR%20GCOV',
        used: 'Searches the same NISAR GCOV collection across NASA archives. Our Earthdata Login account authorizes the downloads.',
      },
      {
        name: 'NISAR Data User Guide (ASF)',
        url: 'https://nisar-docs.asf.alaska.edu/',
        used: 'Explained the GCOV product, file naming (track, frame, mode), the PROVISIONAL vs VALIDATED collections, and the color recipe of the radar images (red/blue = HH, green = HV).',
      },
      {
        name: 'NASA GIBS / Worldview NISAR layer',
        url: 'https://nisar-docs.asf.alaska.edu/worldview/',
        used: 'The sharp 15 m radar image when you zoom in on Downtown and Miami Beach (NISAR_L2_Geocoded_Polarimetric_Covariance). Zoomed out, the map shows our own picture built from the ASF browse images.',
      },
    ],
  },
  {
    group: 'Weather & air (API)',
    items: [
      {
        name: 'Meteomatics Weather API',
        url: 'https://www.meteomatics.com/en/api/getting-started/',
        used: 'Rain, soil moisture, temperature, humidity, wind gusts, evapotranspiration and air quality (PM2.5, ozone, NO₂, air quality index). Weather maps (the colored haze for rain, plants, heat and smog) cover all of South Florida for the 12 days before each NISAR pass. A small server keeps the API password private.',
      },
    ],
  },
  {
    group: 'More satellites',
    items: [
      {
        name: 'VIIRS true-color photos (NOAA-20) via NASA GIBS',
        url: 'https://www.earthdata.nasa.gov/data/instruments/viirs',
        used: 'The "Satellite photo" view: a regular color picture from the clearest day near each NISAR pass, so you can compare what a camera sees with what radar sees.',
      },
      {
        name: 'VIIRS fire detections (NOAA-20 + NOAA-21) via NASA GIBS',
        url: 'https://www.earthdata.nasa.gov/data/tools/firms',
        used: 'The red dots in the Fires layer: every fire the satellites spotted in the 12 days before each NISAR pass. The same data powers NASA FIRMS.',
      },
    ],
  },
  {
    group: 'Night lights',
    items: [
      {
        name: 'NASA Black Marble (VIIRS) via GIBS',
        url: 'https://www.earthdata.nasa.gov/data/projects/black-marble',
        used: 'Annual night-light composites from 2012 and 2016, plus daily NOAA-20 Black Marble images (VJ146A2, gap-filled and BRDF-corrected) for the light pollution layer.',
      },
    ],
  },
  {
    group: 'Learning resources',
    items: [
      {
        name: 'Intro to Remote Sensing (NASA Earthdata)',
        url: 'https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/remote-sensing',
        used: 'Basis for our plain-language explanations of resolution, orbits and how satellites "see".',
      },
      {
        name: 'Intro to Synthetic Aperture Radar (NASA Earthdata)',
        url: 'https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/sar',
        used: 'Wavelength, polarization and scattering (surface, volume, double bounce) explanations in each layer card.',
      },
      {
        name: 'NASA ARSET Trainings',
        url: 'https://www.earthdata.nasa.gov/data/projects/arset',
        used: 'SAR training material for flood mapping and land cover (available in English and Spanish).',
      },
      {
        name: 'NISAR StoryMaps',
        url: 'https://nisar-docs.asf.alaska.edu/storymaps/',
        used: 'Inspiration for telling each place\'s story: floods, wildfires and land subsidence.',
      },
      {
        name: 'NISAR Applications White Papers',
        url: 'https://science.nasa.gov/mission/nisar/societal-benefits/',
        used: 'Real-world uses (disasters, ecosystems, coastal processes) for our "What could NISAR do next?" section.',
      },
    ],
  },
  {
    group: 'Map',
    items: [
      {
        name: 'CARTO Dark Matter basemap (© OpenStreetMap contributors)',
        url: 'https://carto.com/basemaps',
        used: 'Background map with streets and buildings.',
      },
      {
        name: 'MapLibre GL JS + deck.gl',
        url: 'https://maplibre.org/',
        used: 'Open-source libraries that draw the 2D/3D map and the clickable areas.',
      },
    ],
  },
];
