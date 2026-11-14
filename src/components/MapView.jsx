import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { GeoJsonLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers';
import { REGIONS, OVERVIEW_CAMERA } from '../../shared/regions.js';

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';
// NASA GIBS tiles, through our server's caching proxy (server/tiles.js)
const origin = typeof window !== 'undefined' ? window.location.origin : '';
const nisarTiles = (date) => [`${origin}/tiles/nisar/${date}/{z}/{y}/{x}.png`];
const lightsTiles = (date) => [`${origin}/tiles/lights/${date}/{z}/{y}/{x}.png`];

const WORLD = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
const WATER_LABELS = [
  { text: 'Gulf of Mexico', position: [-81.55, 25.55] },
  { text: 'Florida Bay', position: [-80.72, 25.03] },
  { text: 'Atlantic Ocean', position: [-79.92, 25.55] },
  { text: 'Biscayne Bay', position: [-80.235, 25.6] },
];
// Where each region's name tag sits on the map
// (Downtown and Miami Beach are close together, so their tags point away from each other.)
const LABEL_AT = {
  downtown: { at: [-80.2045, 25.7740], anchor: 'right' },
  miamibeach: { at: [-80.1180, 25.8300], anchor: 'left' },
  everglades: { at: [-80.95, 25.84], anchor: 'bottom' },
};

function cameraFor(regionId, mode) {
  const cam = regionId ? REGIONS[regionId].camera : OVERVIEW_CAMERA;
  return { ...cam, pitch: mode === '3d' ? cam.pitch : 0, bearing: mode === '3d' ? cam.bearing : 0 };
}

export default function MapView({ mode, selected, onSelect, date, showRadar, showChange, showLights, studyBounds }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const markersRef = useRef({});
  const readyRef = useRef(false);
  const latest = useRef({});
  latest.current = { onSelect, date, showRadar, showChange, showLights, studyBounds };

  // Create the map once
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      ...cameraFor(null, mode),
      maxPitch: 70,
      attributionControl: { compact: true, customAttribution: 'NISAR & Black Marble imagery: NASA GIBS · Weather: Meteomatics' },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    overlayRef.current = overlay;
    map.addControl(overlay);

    map.on('load', () => {
      const { date: d, studyBounds: sb } = latest.current;
      const firstBuilding = map.getStyle().layers.find((l) => l.id === 'building')?.id;

      // Zoomed out: our own radar picture made from the ASF browse images (scripts/analyze-nisar.js).
      // Zoomed in (>= 11): NASA GIBS NISAR tiles at 15.6 m. GIBS's zoomed-out tiles are unreliable.
      if (sb) {
        map.addSource('nisar-local', {
          type: 'image',
          url: `/data/nisar/radar/${d}.webp`,
          coordinates: [[sb.west, sb.north], [sb.east, sb.north], [sb.east, sb.south], [sb.west, sb.south]],
        });
        map.addLayer({ id: 'nisar-local', type: 'raster', source: 'nisar-local', maxzoom: 11, paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0 } }, firstBuilding);
      }
      map.addSource('nisar', { type: 'raster', tiles: nisarTiles(d), tileSize: 256, minzoom: 11, maxzoom: 13, attribution: 'NISAR GCOV: NASA/JPL-Caltech, ISRO, ASF DAAC' });
      map.addLayer({ id: 'nisar', type: 'raster', source: 'nisar', minzoom: 11, paint: { 'raster-opacity': 0.8, 'raster-fade-duration': 0 } }, firstBuilding);

      map.addSource('lights', { type: 'raster', tiles: lightsTiles(d), tileSize: 256, maxzoom: 8, attribution: 'Black Marble: NASA' });
      map.addLayer({ id: 'lights', type: 'raster', source: 'lights', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.65, 'raster-fade-duration': 0 } }, firstBuilding);

      if (sb) {
        map.addSource('change', {
          type: 'image',
          url: `/data/nisar/change/${d}.png`,
          coordinates: [[sb.west, sb.north], [sb.east, sb.north], [sb.east, sb.south], [sb.west, sb.south]],
        });
        map.addLayer({ id: 'change', type: 'raster', source: 'change', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0 } }, firstBuilding);
      }

      // 3D buildings (only shown in 3D mode)
      map.addLayer({
        id: 'buildings-3d',
        type: 'fill-extrusion',
        source: 'protomaps',
        'source-layer': 'buildings',
        minzoom: 12.5,
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': '#4b5563',
          'fill-extrusion-height': ['coalesce', ['get', 'height'], 8],
          'fill-extrusion-opacity': 0.85,
        },
      });

      readyRef.current = true;
      map.fire('app:ready');
    });

    // Name tags for each region (HTML, so they stay crisp and clickable)
    for (const r of Object.values(REGIONS)) {
      const el = document.createElement('button');
      el.className = 'region-tag';
      el.style.setProperty('--c', `rgb(${r.color.join(',')})`);
      el.innerHTML = `<strong>${r.name}</strong><span>${r.tagline}</span>`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        latest.current.onSelect(r.id);
      });
      markersRef.current[r.id] = new maplibregl.Marker({ element: el, anchor: LABEL_AT[r.id].anchor, offset: LABEL_AT[r.id].anchor === 'right' ? [-8, 0] : LABEL_AT[r.id].anchor === 'left' ? [8, 0] : [0, -4] })
        .setLngLat(LABEL_AT[r.id].at)
        .addTo(map);
    }

    return () => {
      map.remove();
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Camera: fly to the selected region (or back to the overview) and switch 2D/3D
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ ...cameraFor(selected, mode), duration: 1800, essential: true });
  }, [selected, mode]);

  // Raster layers follow the timeline and the toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.getSource('nisar')?.setTiles(nisarTiles(date));
      map.getSource('lights')?.setTiles(lightsTiles(date));
      if (studyBounds) {
        map.getSource('change')?.updateImage({ url: `/data/nisar/change/${date}.png` });
        map.getSource('nisar-local')?.updateImage({ url: `/data/nisar/radar/${date}.webp` });
      }
      const vis = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      vis('nisar', showRadar);
      vis('nisar-local', showRadar);
      vis('lights', showLights);
      vis('change', showChange);
      vis('buildings-3d', mode === '3d');
    };
    if (readyRef.current) apply();
    else map.once('app:ready', apply);
  }, [date, showRadar, showChange, showLights, mode, studyBounds]);

  // Region tags: dim the ones that are not selected
  useEffect(() => {
    for (const [id, m] of Object.entries(markersRef.current)) {
      m.getElement().classList.toggle('dim', Boolean(selected) && selected !== id);
      m.getElement().classList.toggle('active', selected === id);
    }
  }, [selected]);

  // deck.gl layers: the clickable, colored regions and the focus mask
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const features = Object.values(REGIONS).map((r) => ({
      type: 'Feature',
      properties: { id: r.id, color: r.color },
      geometry: { type: 'Polygon', coordinates: [r.polygon] },
    }));
    const extrude = mode === '3d' && !selected;
    const elevation = { everglades: 1800, downtown: 700, miamibeach: 700 };

    const layers = [];
    if (selected) {
      // darken everything outside the selected region
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
        wireframe: false,
        getElevation: (f) => elevation[f.properties.id],
        getFillColor: (f) => {
          const isSel = f.properties.id === selected;
          const alpha = selected ? (isSel ? 0 : 40) : showRadar || showChange || showLights ? 45 : 120;
          return [...f.properties.color, alpha];
        },
        getLineColor: (f) => [...f.properties.color, selected && f.properties.id !== selected ? 110 : 255],
        getLineWidth: (f) => (f.properties.id === selected ? 3 : 2),
        lineWidthUnits: 'pixels',
        material: { ambient: 0.6, diffuse: 0.5, shininess: 8 },
        autoHighlight: !selected,
        highlightColor: [255, 255, 255, 40],
        onClick: (info) => info.object && latest.current.onSelect(info.object.properties.id),
        updateTriggers: { getFillColor: [selected, showRadar, showChange, showLights], getLineColor: [selected], getLineWidth: [selected] },
      }),
      new TextLayer({
        id: 'water-labels',
        data: WATER_LABELS,
        getText: (d) => d.text,
        getPosition: (d) => d.position,
        getColor: [148, 163, 184, 170],
        getSize: 13,
        fontFamily: 'system-ui, sans-serif',
        fontSettings: { sdf: true },
        characterSet: 'auto',
        billboard: false,
        visible: !selected,
      }),
    );
    overlay.setProps({
      layers,
      getCursor: ({ isHovering }) => (isHovering ? 'pointer' : 'grab'),
    });
  }, [selected, mode, showRadar, showChange, showLights]);

  return <div ref={containerRef} className="map" role="application" aria-label="Map of South Florida" />;
}
