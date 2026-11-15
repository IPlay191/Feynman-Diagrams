# Dancing with SARs 🛰️

**By Feynman Diagrams · NASA Space Apps Challenge**

An interactive map that shows how NASA-ISRO's **NISAR** radar satellite sees three places in South Florida change over a year:

| Place | Story | What we track |
|---|---|---|
| 🟧 **Downtown Miami** | A city that glows and breathes | Smog, night lights, flooding |
| 🟦 **Miami Beach** | An island under pressure | Flooding, vegetation, night lights |
| 🟩 **Everglades** | The river of grass | Wet-season flooding, vegetation, fires |

Click an area to fly to it. The side panel then shows information **only for that area**. Click **anywhere else** in South Florida for simple facts about that spot. Each box at the bottom draws its own layer on the map:

| Box | On the map |
|---|---|
| 💧 Flooding | NISAR open water (blue), new water since the first pass (cyan), rain haze (Meteomatics) |
| 🌳 Deforestation | NISAR plants (green), plants lost since the first pass (brown), plant water-use haze |
| 🔥 Fires | VIIRS fire detections (red dots), afternoon-heat haze |
| 🌫️ Pollution / Smog | PM2.5 haze (Meteomatics) |
| 💡 Light Pollution | NASA Black Marble night lights |

Drag or **play** the timeline through all 27 NISAR passes from **Nov 2025 to Oct 2026**. With **Sound on**, you also hear the data: higher notes mean more of what the radar measures, taps mean rain, and a buzzy tone means dirtier air. The map has four views: **Radar image**, **What changed**, **Satellite photo** and **Plain map**. "What changed" compares each pass with the first one: blue means **less signal came back** (often new standing water, or plants that dried, burned or were cut), orange means **more signal came back** (often thicker or wetter plants, new buildings, or water under trees).

In **3D**, every checkbox draws columns that grow and shrink as the timeline plays: new water, plant cover (brown where plants were lost), fires, PM2.5 and night lights. Click an area to focus on it: the map then shows only that area's pictures, columns and info. **Low Quality Mode** (top right) turns off 3D and effects for older computers. Weak devices start with it on.

---

## Quick start

Requirements: [Node.js 20+](https://nodejs.org/).

```powershell
npm install
copy .env.example .env      # then fill in your credentials (see below)
npm run dev                 # website on http://localhost:5173, API on :8787
```

The processed NISAR and Black Marble data are already in `public/data/`, so the site works without downloading anything.

### Credentials (`.env`)

| Variable | Used for | Get it at |
|---|---|---|
| `METEOMATICS_USERNAME` / `METEOMATICS_PASSWORD` | Weather and air-quality data | [meteomatics.com](https://www.meteomatics.com/en/api/getting-started/) |
| `EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD` | Only for re-downloading NISAR data | [urs.earthdata.nasa.gov](https://urs.earthdata.nasa.gov/) |

`.env` is git-ignored. **Never commit it.** The browser never sees these passwords: it only talks to our server (`server/`), which adds them.

### Production

```powershell
npm run build   # builds the website into dist/
npm start       # one server: website + /api on http://localhost:8787
```

### Deploying on Vercel

The repo is ready for Vercel: `api/index.js` runs the same Express routes as `server/app.js`, and `vercel.json` sends every `/api/...` request to it.

1. Import the repo in Vercel (framework preset: **Vite**; build command `npm run build`; output folder `dist`).
2. In **Settings → Environment Variables**, add `METEOMATICS_USERNAME` and `METEOMATICS_PASSWORD`.
3. Redeploy.

Without those two variables the site still works: the weather cards show the saved weather from `public/data/weather-maps.json` instead of live values.

### Troubleshooting

- **No live weather / "Live weather is offline" banner (only shown in `npm run dev`):** the weather server is not running. Close every old terminal that runs `npm run dev`, then start it once. If port 8787 or 5173 is busy, the terminal now says so instead of quietly using another port.
- **"needs your Meteomatics login" banner:** create `.env` from `.env.example`. Each teammate needs their own copy, because `.env` is not in Git.

### Refreshing the data

```powershell
npm run fetch:nisar         # search ASF, download NISAR browse images (~220 MB, cached in data/raw), analyze
npm run fetch:lights        # Black Marble night-light values per area
npm run fetch:satellites    # sharp city radar, true-color photos, fire detections, night-light pictures (NASA GIBS)
npm run fetch:weather-maps  # Meteomatics weather maps for each pass (needs .env)
npm run fetch:laguaira      # La Guaira: NISAR GUNW + USGS quakes (~150 MB browse, plus 4 x 2.3 GB .h5 in a temp folder)
npm run fetch:all           # all of the above, in order
```

All map pictures are saved ahead of time in `public/data/`. The website does not load live map tiles from NASA, which keeps the map from flickering and works on slow connections.

---

## How it works

```
Browser (React + MapLibre + deck.gl)
   │  /api/series, /api/now, /api/spot ──► server/app.js ──► Meteomatics API   (password stays on the server)
   │                                       (run by server/index.js locally, api/index.js on Vercel)
   └─ /data/* pictures and JSON (pre-computed by scripts/ from ASF, NASA GIBS and Meteomatics)
```

### NISAR radar (the core data)
1. **Find.** `scripts/fetch-nisar.js` queries the [ASF Search API](https://search.asf.alaska.edu/) (the engine behind ASF Vertex) for NISAR **L2 GCOV** products on ascending **track 47, frames 14 + 15**. One pass covers all three areas and repeats every 12 days.
2. **Download.** It logs in with NASA Earthdata and downloads each product's geocoded browse image (`_LATLON.png`) and its corner coordinates (`_LATLON.kml`).
3. **Analyze.** `scripts/analyze-nisar.js` resamples every pass onto one ~200 m grid and classifies each pixel from its colors (red/blue = **HH**, green = **HV**):
   - **open water**: HH and HV both dark (calm water reflects radar away, like a mirror)
   - **bright / double bounce**: HH and HV both very bright (buildings, or water under trees)
   - **vegetation**: everything else (leaves and branches scatter radar, which raises HV)

   It also builds a **change map** for each date compared with the first pass (orange = brighter echo, blue = darker echo).
4. **Display.** The radar picture on the map is NASA GIBS's `NISAR_L2_Geocoded_Polarimetric_Covariance` daily mosaic at 15.6 m resolution.

> ⚠️ The browse images are display-scaled, not calibrated backscatter. All radar numbers are **relative indicators**, good for spotting patterns over time but not scientific measurements. For research, use the full `.h5` GCOV files.

### Weather and air (Meteomatics API)
Daily values at each area's center point: rain, soil moisture, evapotranspiration, max temperature, humidity, wind gusts, PM2.5, ozone, NO₂ and the air-quality index (0 = Good to 5 = Extremely Poor). The server only allows the parameters listed in `shared/layers.js`, checks dates and areas, rate-limits requests per visitor, and caches past data on disk.

### Night lights (NASA Black Marble)
`scripts/fetch-lights.js` averages the Black Marble tiles over each area: the 2012 and 2016 annual composites, plus daily NOAA-20 VIIRS images (VJ146A2) around each NISAR pass. Values are relative brightness from 0 to 100.

---

## What we found (Nov 2025 to Oct 2026)

- **Everglades:** The share that looks like open water stayed near **8%** until August, then jumped to **16-20%** in September and October. That is the wet season: September brought 305 mm of rain, and the soil was saturated. The marsh looked most "vegetated" in the dry season (Feb-May), when burn risk is highest.
- **Miami Beach:** It got 330 mm of rain in May and 386 mm in September, yet NISAR saw little standing water. The satellite passes around sunrise every 12 days and misses short street floods, and pumps drain them fast. Night brightness rose from **79 (2012) to 91 (2016) to about 99 now**.
- **Downtown:** It is so bright to radar ("double bounce" off buildings) that the signal saturates. NO₂ from traffic peaked in winter, and ozone peaked in April. It is the brightest place at night.

Full explanations and hypotheses are in the app (`src/data/insights.js`).

### Other perspective: La Guaira, Venezuela (earthquakes)

The **🌎 Other perspective: La Guaira** button (top right) unloads South Florida and opens a second map of La Guaira state, which is also reachable at `/#la-guaira`. On **June 24, 2026, a magnitude 7.5 earthquake** struck 20 km west of Catia La Mar. The view shows only earthquakes and ground movement:

- **NISAR rings:** 46 NISAR **GUNW** (Geocoded Unwrapped Interferogram) products from ascending track 61 and descending track 126, cut to La Guaira's land. Each full loop of colors is about 12 cm of movement toward or away from the satellite (half of NISAR's 24.2 cm wavelength).
- **Ground movement (cm):** `scripts/process-laguaira.js` reads the full `.h5` files for the passes that span the quake on both tracks. It removes the ionosphere delay, ignores water and low-coherence pixels (coherence ≤ 0.3), and measures against ground more than 90 km from the epicenter. Combining the two viewing directions splits the movement into east-west and up-down. North-south movement is left out because radar barely sees it.
- **Result:** during the quake, the coast from Maiquetía to Caraballeda moved **about 1 to 1.2 m west**, with almost no up or down movement. Over the 12 days before the quake, the same method measured about 8 cm, which is the method's noise level. The direction matches USGS, which classified the quake as sideways (strike-slip) with up to 1.8 m of slip on the fault.
- **Sound:** each step of the slider plays a sound (`src/laguaira/quakeSound.js`). Calm ground plays a soft hum, each quake adds a deep thump, and some movement gives a wobbling tone. When the ground moved a lot (measured movement of 36 cm or more, or a quake of about M5.5+ elsewhere), it plays an alarm: a wailing siren, warning beeps and a distorted rumble. During playback the alarm steps stay on screen twice as long.
- **Quakes:** every M2.5+ quake within 35 km from the [USGS catalog](https://earthquake.usgs.gov/earthquakes/search/), on the map and in a clickable list.

We convert phase to movement with movement = −phase × wavelength / 4π, where positive means toward the satellite. The product files don't state that sign, so we checked it against the USGS fault model: the towns sit south of a right-lateral east-west fault, so they should move west, and with this sign the decomposition gives west. GUNW products are PROVISIONAL, so treat these numbers as good estimates, not survey values.

### What NISAR could do next
Measure **land subsidence** with interferometry (GUNW products), track **mangrove biomass** after hurricanes, map **floods through storm clouds**, and monitor **Everglades restoration**.

---

## Data sources

| Resource | How we used it |
|---|---|
| [ASF Data Search Vertex](https://search.asf.alaska.edu/) | Finding and listing NISAR GCOV scenes (via the ASF Search API) |
| [NASA Earthdata Search](https://search.earthdata.nasa.gov/) | Same NISAR collections; Earthdata Login authorizes downloads |
| [NISAR Data User Guide](https://nisar-docs.asf.alaska.edu/) | Product formats, naming, the radar color recipe, Worldview layers |
| [NASA GIBS / Worldview](https://nisar-docs.asf.alaska.edu/worldview/) | NISAR radar and Black Marble map tiles |
| [Meteomatics API](https://www.meteomatics.com/en/api/getting-started/) | Weather and air quality |
| [NASA Black Marble](https://www.earthdata.nasa.gov/data/projects/black-marble) | Night lights / light pollution |
| [Intro to Remote Sensing](https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/remote-sensing) | Plain-language explanations |
| [Intro to SAR](https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/sar) | Polarization and scattering explanations |
| [NASA ARSET Trainings](https://www.earthdata.nasa.gov/data/projects/arset) | SAR flood and land-cover methods |
| [NISAR StoryMaps](https://nisar-docs.asf.alaska.edu/storymaps/) | Storytelling inspiration |
| [NISAR Applications White Papers](https://science.nasa.gov/mission/nisar/societal-benefits/) | Future applications |
| [CARTO basemap](https://carto.com/basemaps) © OpenStreetMap contributors | Background map |

## Project layout

```
server/      Express API proxy (Meteomatics): app.js = routes, index.js = local server
api/         Vercel entry point (reuses server/app.js)
src/laguaira/ The La Guaira earthquakes view (loaded only when opened)
scripts/     NISAR download/analysis and Black Marble scripts
shared/      Area outlines and layer definitions (used by server, scripts and website)
src/         React website (map, panels, timeline, checkboxes)
public/data/ Pre-computed NISAR statistics, change maps and night-light values
```

## License

MIT
