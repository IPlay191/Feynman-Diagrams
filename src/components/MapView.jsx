import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ColumnLayer, GeoJsonLayer, ScatterplotLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers';
import { REGIONS, OVERVIEW_CAMERA, STUDY_BOUNDS, CITY_BOUNDS, SOUTH_FL_BOUNDS, boundsToCorners, inBounds } from '../../shared/regions.js';
import { LAYERS } from '../../shared/layers.js';
import { loadGrid, waterPicture, plantsPicture, changePicture, changeBlocks } from '../lib/radarGrid.js';
import { weatherPicture } from '../lib/weatherMaps.js';

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';
const EMPTY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const STUDY = boundsToCorners(STUDY_BOUNDS);
const CITY = boundsToCorners(CITY_BOUNDS);
const SF = SOUTH_FL_BOUNDS;
const WORLD = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
const SF_RING = [[SF.west, SF.south], [SF.east, SF.south], [SF.east, SF.north], [SF.west, SF.north], [SF.west, SF.south]];

const WATER_LABELS = [
  { text: 'Gulf of Mexico', position: [-81.42, 25.45] },
  { text: 'Florida Bay', position: [-80.72, 25.03] },
  { text: 'Atlantic Ocean', position: [-79.97, 25.55] },
  { text: 'Biscayne Bay', position: [-80.235, 25.6] },
];
// Where each region's name tag sits (Downtown and Miami Beach point away from each other)
const LABEL_AT = {
  downtown: { at: [-80.2045, 25.774], anchor: 'right', offset: [-8, 0] },
  miamibeach: { at: [-80.118, 25.83], anchor: 'left', offset: [8, 0] },
  everglades: { at: [-80.95, 25.84], anchor: 'bottom', offset: [0, -4] },
};

// Image layers, bottom to top. Every one is a single pre-made picture (no live map tiles), which
// is what stops the flickering.
const IMAGE_LAYERS = [
  { id: 'photo', corners: STUDY },
  { id: 'radar-local', corners: STUDY },
  { id: 'radar-city', corners: CITY, minzoom: 10.5 },
  { id: 'change-flat', corners: STUDY },
  { id: 'wx-rain', corners: STUDY, opacity: 0.8 },
  { id: 'wx-plants', corners: STUDY, opacity: 0.8 },
  { id: 'wx-heat', corners: STUDY, opacity: 0.5 },
  { id: 'wx-pm25', corners: STUDY, opacity: 0.85 },
  { id: 'mask-plants', corners: STUDY },
  { id: 'mask-water', corners: STUDY },
  { id: 'lights', corners: STUDY, opacity: 0.9 },
  { id: 'fires', corners: STUDY },
];

function cameraFor(regionId, mode) {
  const cam = regionId ? REGIONS[regionId].camera : OVERVIEW_CAMERA;
  return { ...cam, pitch: mode === '3d' ? cam.pitch : 0, bearing: mode === '3d' ? cam.bearing : 0 };
}

// Pictures made from radar grids are cached so moving the timeline back and forth is instant.
const pictureCache = new Map();
async function radarPicture(kind, date, baseDate, classes) {
  const key = `${kind}:${date}`;
  if (!pictureCache.has(key)) {
    pictureCache.set(key, (async () => {
      const [cur, base] = await Promise.all([loadGrid(date), loadGrid(baseDate)]);
      if (kind === 'water') return waterPicture(cur, base, classes);
      if (kind === 'plants') return plantsPicture(cur, base, classes);
      return changePicture(cur, base, classes);
    })());
  }
  return pictureCache.get(key);
}

// Fire detections are single pixels; draw each as a bigger dot with a dark ring so it is easy to see.
async function firePicture(date) {
  const key = `fires:${date}`;
  if (!pictureCache.has(key)) {
    pictureCache.set(key, (async () => {
      const img = new Image();
      img.src = `/data/sat/fires/${date}.png`;
      await img.decode();
      const src = document.createElement('canvas');
      src.width = img.width;
      src.height = img.height;
      const sctx = src.getContext('2d', { willReadFrequently: true });
      sctx.drawImage(img, 0, 0);
      const { data } = sctx.getImageData(0, 0, img.width, img.height);
      const out = document.createElement('canvas');
      out.width = img.width;
      out.height = img.height;
      const ctx = out.getContext('2d');
      for (let i = 0; i < img.width * img.height; i++) {
        if (data[i * 4 + 3] === 0) continue;
        const x = i % img.width, y = Math.floor(i / img.width);
        ctx.beginPath();
        ctx.arc(x + 0.5, y + 0.5, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = '#ff4500';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(40,0,0,0.9)';
        ctx.stroke();
      }
      return out.toDataURL('image/png');
    })());
  }
  return pictureCache.get(key);
}

export default function MapView({ mode, selected, onSelect, spot, onSpot, date, view, active, lowQuality, nisar, sat, wx }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const markersRef = useRef({});
  const shownRef = useRef({}); // source id -> url currently shown
  const tokenRef = useRef({}); // source id -> latest request (ignore stale ones)
  const [ready, setReady] = useState(false);
  const [blocks, setBlocks] = useState(null);
  const latest = useRef({});
  latest.current = { onSelect, onSpot };

  // ---------- create the map once ----------
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      ...cameraFor(null, mode),
      minZoom: 7.3,
      maxPitch: 60,
      // the map cannot be moved away from South Florida, so no other tiles ever load
      maxBounds: [[SF.west - 0.35, SF.south - 0.35], [SF.east + 0.35, SF.north + 0.35]],
      renderWorldCopies: false,
      fadeDuration: 0,
      pixelRatio: lowQuality ? 1 : Math.min(window.devicePixelRatio || 1, 2),
      attributionControl: { compact: true, customAttribution: 'NISAR: NASA/JPL-Caltech, ISRO, ASF DAAC · Satellite images: NASA GIBS · Weather: Meteomatics' },
    });
    mapRef.current = map;
    if (import.meta.env.DEV) window.__map = map; // for debugging in the browser console
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    // deck.gl draws on its own canvas above the map (not mixed into the map's depth buffer),
    // so its shapes can never "fight" with map layers and flicker.
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    overlayRef.current = overlay;
    map.addControl(overlay);

    map.on('load', () => {
      const before = map.getStyle().layers.find((l) => l.id === 'building')?.id;
      for (const L of IMAGE_LAYERS) {
        map.addSource(L.id, { type: 'image', url: EMPTY, coordinates: L.corners });
        map.addLayer(
          {
            id: L.id,
            type: 'raster',
            source: L.id,
            ...(L.minzoom ? { minzoom: L.minzoom } : {}),
            layout: { visibility: 'none' },
            paint: { 'raster-opacity': L.opacity ?? 1, 'raster-fade-duration': 0, 'raster-resampling': L.nearest ? 'nearest' : 'linear' },
          },
          before,
        );
      }
      map.addLayer({
        id: 'buildings-3d',
        type: 'fill-extrusion',
        source: 'protomaps',
        'source-layer': 'buildings',
        minzoom: 12.5,
        layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': '#4b5563', 'fill-extrusion-height': ['coalesce', ['get', 'height'], 8], 'fill-extrusion-opacity': 0.85 },
      });
      // Cut out everything except South Florida
      map.addSource('outside', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [WORLD, SF_RING] } } });
      map.addLayer({ id: 'outside', type: 'fill', source: 'outside', paint: { 'fill-color': '#0b1220', 'fill-opacity': 1 } });
      map.addLayer({ id: 'outside-edge', type: 'line', source: 'outside', paint: { 'line-color': '#22304a', 'line-width': 1 } });
      setReady(true);
    });

    // One click handler: a colored area selects it, anywhere else in the study area shows "this spot".
    map.on('click', (e) => {
      const hit = overlay.pickObject({ x: e.point.x, y: e.point.y, layerIds: ['regions'], radius: 2 });
      if (hit?.object) return latest.current.onSelect(hit.object.properties.id);
      const { lng, lat } = e.lngLat;
      if (inBounds(STUDY_BOUNDS, lng, lat)) latest.current.onSpot({ lon: lng, lat });
    });

    for (const r of Object.values(REGIONS)) {
      const el = document.createElement('button');
      el.className = 'region-tag';
      el.style.setProperty('--c', `rgb(${r.color.join(',')})`);
      el.innerHTML = `<strong>${r.name}</strong><span>${r.tagline}</span>`;
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        latest.current.onSelect(r.id);
      });
      const L = LABEL_AT[r.id];
      markersRef.current[r.id] = new maplibregl.Marker({ element: el, anchor: L.anchor, offset: L.offset }).setLngLat(L.at).addTo(map);
    }

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- quality ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setPixelRatio(lowQuality ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    overlayRef.current?.setProps({ useDevicePixels: !lowQuality });
  }, [lowQuality]);

  // ---------- camera ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const cam = cameraFor(selected, mode);
    if (lowQuality) map.jumpTo(cam);
    else map.flyTo({ ...cam, duration: 1600, essential: true });
  }, [selected, mode, lowQuality]);

  // ---------- pictures ----------
  // Shows a picture only after it has fully loaded, so layers never blink while changing dates.
  function show(id, url, corners) {
    const map = mapRef.current;
    if (!map?.getSource(id)) return;
    const token = (tokenRef.current[id] = (tokenRef.current[id] ?? 0) + 1);
    if (!url) {
      map.setLayoutProperty(id, 'visibility', 'none');
      return;
    }
    if (shownRef.current[id] === url) {
      map.setLayoutProperty(id, 'visibility', 'visible');
      return;
    }
    const img = new Image();
    img.src = url;
    img.decode().then(
      () => {
        if (tokenRef.current[id] !== token || !mapRef.current) return;
        map.getSource(id).updateImage({ url, ...(corners ? { coordinates: corners } : {}) });
        shownRef.current[id] = url;
        map.setLayoutProperty(id, 'visibility', 'visible');
      },
      () => tokenRef.current[id] === token && map.setLayoutProperty(id, 'visibility', 'none'),
    );
  }

  useEffect(() => {
    if (!ready || !nisar) return;
    const map = mapRef.current;
    const base = nisar.dates[0].date;
    const classes = nisar.classes;
    const blocks3d = view === 'change' && mode === '3d' && !lowQuality;
    let alive = true;

    // base picture
    show('photo', view === 'photo' && sat?.dates[date]?.photoDate ? `/data/sat/photo/${date}.jpg` : null);
    show('radar-local', view === 'radar' ? `/data/nisar/radar/${date}.webp` : null);
    show('radar-city', view === 'radar' && !lowQuality && sat?.dates[date]?.cityOk ? `/data/sat/city/${date}.webp` : null);
    if (view === 'change') radarPicture('change', date, base, classes).then((u) => alive && show('change-flat', u));
    else show('change-flat', null);
    map.setPaintProperty('change-flat', 'raster-opacity', blocks3d ? 0.35 : 0.9);

    // what each ticked box adds
    const want = { water: false, plants: false, rain: false, wplants: false, heat: false, pm25: false, fires: false, lights: false };
    for (const id of active) {
      const m = LAYERS[id].map;
      if (m.radar) want[m.radar] = true;
      if (m.weather) want[m.weather === 'plants' ? 'wplants' : m.weather] = true;
      if (m.sat) want[m.sat] = true;
    }
    for (const [kind, on] of [['water', want.water], ['plants', want.plants]]) {
      if (on) radarPicture(kind, date, base, classes).then((u) => alive && show(`mask-${kind}`, u));
      else show(`mask-${kind}`, null);
    }
    for (const [id, on] of [['rain', want.rain], ['plants', want.wplants], ['heat', want.heat], ['pm25', want.pm25]]) {
      const pic = on && wx?.maps?.[id] ? weatherPicture(wx, id, date) : null;
      show(`wx-${id}`, pic?.url ?? null, pic?.corners);
    }
    if (want.fires) firePicture(date).then((u) => alive && show('fires', u));
    else show('fires', null);
    show('lights', want.lights ? `/data/sat/lights/${date}.webp` : null);
    map.setLayoutProperty('buildings-3d', 'visibility', mode === '3d' && !lowQuality ? 'visible' : 'none');

    // 3D change blocks
    if (blocks3d) {
      Promise.all([loadGrid(date), loadGrid(base)]).then(([cur, b]) => {
        if (alive) setBlocks(changeBlocks(cur, b, classes, nisar.studyBounds, nisar.grid.step));
      });
    } else setBlocks(null);

    // load the next date in the background so playing the timeline is smooth
    const i = nisar.dates.findIndex((d) => d.date === date);
    const next = nisar.dates[(i + 1) % nisar.dates.length].date;
    loadGrid(next).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, nisar, sat, wx, date, view, active, mode, lowQuality]);

  // ---------- region tags ----------
  useEffect(() => {
    for (const [id, m] of Object.entries(markersRef.current)) {
      m.getElement().classList.toggle('dim', Boolean(selected) && selected !== id);
      m.getElement().classList.toggle('active', selected === id);
    }
  }, [selected]);

  // ---------- deck.gl layers ----------
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const features = Object.values(REGIONS).map((r) => ({
      type: 'Feature',
      properties: { id: r.id, color: r.color },
      geometry: { type: 'Polygon', coordinates: [r.polygon] },
    }));
    const busy = view !== 'plain' || active.size > 0;
    const extrude = mode === '3d' && !selected && !lowQuality && view !== 'change';
    const step = nisar?.grid.step ?? 0.0018;

    const layers = [];
    if (blocks) {
      layers.push(
        new ColumnLayer({
          id: 'change-blocks',
          data: blocks,
          diskResolution: 4,
          angle: 45,
          radius: (5 * step * 111_000) / 2 * 0.9 * Math.SQRT2,
          extruded: true,
          getPosition: (d) => d.position,
          // only real changes get height; everything else lies flat (and grows when it changes)
          getElevation: (d) => (Math.abs(d.change) < (nisar?.classes.changeMin ?? 35) ? 0 : (Math.abs(d.change) - 25) * 60),
          getFillColor: (d) =>
            Math.abs(d.change) < (nisar?.classes.changeMin ?? 35) ? [148, 163, 184, 0] : d.change > 0 ? [249, 115, 22, 235] : [59, 130, 246, 235],
          material: { ambient: 0.55, diffuse: 0.6, shininess: 16 },
          transitions: { getElevation: { duration: 900 }, getFillColor: { duration: 600 } },
          updateTriggers: { getElevation: date, getFillColor: date },
        }),
      );
    }
    if (selected) {
      layers.push(
        new SolidPolygonLayer({
          id: 'focus-mask',
          data: [{ polygon: [WORLD, REGIONS[selected].polygon] }],
          getPolygon: (d) => d.polygon,
          getFillColor: [6, 11, 22, 165],
        }),
      );
    }
    layers.push(
      new GeoJsonLayer({
        id: 'regions',
        data: features,
        pickable: true,
        stroked: true,
        filled: true,
        extruded: extrude,
        getElevation: (f) => ({ everglades: 1800, downtown: 700, miamibeach: 700 })[f.properties.id],
        getFillColor: (f) => [...f.properties.color, selected ? (f.properties.id === selected ? 0 : 40) : busy ? 25 : 120],
        getLineColor: (f) => [...f.properties.color, selected && f.properties.id !== selected ? 110 : 255],
        getLineWidth: (f) => (f.properties.id === selected ? 3 : 2),
        lineWidthUnits: 'pixels',
        material: { ambient: 0.6, diffuse: 0.5, shininess: 8 },
        autoHighlight: !selected && !lowQuality,
        highlightColor: [255, 255, 255, 40],
        updateTriggers: { getFillColor: [selected, busy], getLineColor: [selected], getLineWidth: [selected] },
      }),
      new TextLayer({
        id: 'water-labels',
        data: WATER_LABELS,
        getText: (d) => d.text,
        getPosition: (d) => d.position,
        getColor: [148, 163, 184, 170],
        getSize: 13,
        fontFamily: 'system-ui, sans-serif',
        billboard: false,
        visible: !selected,
      }),
    );
    if (spot) {
      layers.push(
        new ScatterplotLayer({
          id: 'spot',
          data: [spot],
          getPosition: (d) => [d.lon, d.lat],
          getRadius: 7,
          radiusUnits: 'pixels',
          getFillColor: [255, 255, 255, 255],
          getLineColor: [11, 18, 32, 255],
          lineWidthMinPixels: 3,
          stroked: true,
        }),
      );
    }
    overlay.setProps({ layers, getCursor: ({ isHovering }) => (isHovering ? 'pointer' : 'crosshair') });
  }, [selected, mode, view, active, lowQuality, blocks, spot, date, nisar]);

  return <div ref={containerRef} className="map" role="application" aria-label="Map of South Florida" />;
}
