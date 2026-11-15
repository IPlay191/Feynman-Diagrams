import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ColumnLayer, PathLayer, ScatterplotLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers';
import { LG_BOUNDS, LG_CAMERA, LG_MAP_BOUNDS, LG_NEIGHBORS, LG_POLYGON, LG_TOWNS } from '../../shared/laguaira.js';
import { boundsToCorners } from '../../shared/regions.js';
import { rampColor } from './ramp.js';

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';
const EMPTY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const CORNERS = boundsToCorners(LG_BOUNDS);
const WORLD = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
const STATE_BOX = [
  [Math.min(...LG_POLYGON.map((p) => p[0])), Math.min(...LG_POLYGON.map((p) => p[1]))],
  [Math.max(...LG_POLYGON.map((p) => p[0])), Math.max(...LG_POLYGON.map((p) => p[1]))],
];
const SEA_LABELS = [{ text: 'Caribbean Sea', position: [-66.95, 10.86] }];

// Quake marker size (meters) grows with magnitude, like the area that shook.
const quakeRadius = (mag) => 350 * 1.7 ** (mag - 3);
// 3D: quake columns get taller with magnitude
const quakeHeight = (mag) => Math.max(600, (mag - 2) * 1400);

const camera = (mode) => ({ ...LG_CAMERA, pitch: mode === '3d' ? LG_CAMERA.pitch : 0, bearing: mode === '3d' ? LG_CAMERA.bearing : 0 });

export default function LaGuairaMap({ data, pair, view, mode, lowQuality, selectedQuake, onQuake }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const shownRef = useRef(null);
  const [ready, setReady] = useState(false);
  const latest = useRef({});
  latest.current = { onQuake };
  const use3d = mode === '3d' && !lowQuality;

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      ...camera(mode),
      minZoom: 8.6,
      maxPitch: 60,
      maxBounds: [[LG_MAP_BOUNDS.west, LG_MAP_BOUNDS.south], [LG_MAP_BOUNDS.east, LG_MAP_BOUNDS.north]],
      renderWorldCopies: false,
      fadeDuration: 0,
      pixelRatio: lowQuality ? 1 : Math.min(window.devicePixelRatio || 1, 2),
      attributionControl: { compact: true, customAttribution: 'NISAR: NASA/JPL-Caltech, ISRO, ASF DAAC · Earthquakes: USGS' },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    const overlay = new MapboxOverlay({
      interleaved: false,
      layers: [],
      useDevicePixels: !lowQuality,
      getCursor: ({ isHovering }) => (isHovering ? 'pointer' : 'grab'),
      getTooltip: ({ object, layer }) => {
        if (!object || !layer) return null;
        if (layer.id.startsWith('quakes')) return { text: `M${object.mag} · ${new Date(object.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}\n${object.place}` };
        if (layer.id === 'move-cols') return { text: `Moved about ${Math.round(Math.hypot(object[2], object[3]))} cm` };
        return null;
      },
      onClick: ({ object, layer }) => {
        if (object && layer?.id.startsWith('quakes')) latest.current.onQuake(object.id);
      },
    });
    overlayRef.current = overlay;
    map.addControl(overlay);
    map.on('load', () => {
      const before = map.getStyle().layers.find((l) => l.id === 'building')?.id;
      map.addSource('lg-pic', { type: 'image', url: EMPTY, coordinates: CORNERS });
      map.addLayer({ id: 'lg-pic', type: 'raster', source: 'lg-pic', paint: { 'raster-opacity': 0.92, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' } }, before);
      setReady(true);
    });
    return () => map.remove();
    // the map is created once; mode and quality changes are applied below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2D / 3D camera: always frame the whole state, whatever the screen size
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const bearing = use3d ? LG_CAMERA.bearing : 0;
    // frame the state and every quake, so the nearby quakes and their cities are in view too
    const lons = [STATE_BOX[0][0], STATE_BOX[1][0], ...data.quakes.map((q) => q.lon)];
    const lats = [STATE_BOX[0][1], STATE_BOX[1][1], ...data.quakes.map((q) => q.lat)];
    const box = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
    const cam = map.cameraForBounds(box, { padding: { top: 60, bottom: 60, left: 90, right: 60 }, bearing });
    if (cam) map.easeTo({ ...cam, bearing, pitch: use3d ? LG_CAMERA.pitch : 0, duration: 800 });
  }, [use3d, ready, data]);

  // the NISAR picture: raw rings, or ground movement in cm
  const movement = pair?.movement && view === 'movement' ? data.movement[pair.movement] : null;
  const picUrl = movement ? movement.url : pair?.fringe;
  useEffect(() => {
    if (!ready || !picUrl || shownRef.current === picUrl) return;
    let alive = true;
    const img = new Image();
    img.src = picUrl;
    img.decode().then(() => {
      if (!alive) return;
      mapRef.current.getSource('lg-pic')?.updateImage({ url: picUrl, coordinates: CORNERS });
      shownRef.current = picUrl;
    }).catch(() => {});
    return () => { alive = false; };
  }, [ready, picUrl]);

  // fly to a quake the user picked in the list
  useEffect(() => {
    if (!ready || !selectedQuake) return;
    const q = data.quakes.find((x) => x.id === selectedQuake);
    if (q) mapRef.current.easeTo({ center: [q.lon, q.lat], zoom: Math.max(mapRef.current.getZoom(), 10), duration: 900 });
  }, [ready, selectedQuake, data]);

  // deck.gl: outline, quakes, 3D movement columns, town names
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !pair) return;
    const end = pair.toTime;
    const shown = data.quakes.filter((q) => q.time <= end);
    const isNew = (q) => pair.quakes.includes(q.id);
    const layers = [
      // a light dim outside La Guaira: the state stands out, but the streets of neighboring cities still show
      new SolidPolygonLayer({ id: 'outside', data: [{ p: [WORLD, LG_POLYGON] }], getPolygon: (d) => d.p, getFillColor: [11, 18, 32, 60], pickable: false }),
      new ScatterplotLayer({
        id: 'neighbors', data: LG_NEIGHBORS, getPosition: (t) => [t.lon, t.lat], getRadius: 3, radiusUnits: 'pixels',
        getFillColor: [148, 163, 184, 220], getLineColor: [11, 18, 32, 255], stroked: true, lineWidthUnits: 'pixels', getLineWidth: 1,
      }),
      new TextLayer({
        id: 'neighbor-names', data: LG_NEIGHBORS, getText: (t) => t.name, getPosition: (t) => [t.lon, t.lat], getSize: 11,
        getColor: [148, 163, 184, 235], getTextAnchor: 'middle', getAlignmentBaseline: 'top', getPixelOffset: [0, 6],
        fontFamily: 'system-ui, sans-serif', outlineWidth: 3, outlineColor: [11, 18, 32, 255], fontSettings: { sdf: true }, characterSet: 'auto',
      }),
      new PathLayer({ id: 'outline', data: [{ p: LG_POLYGON }], getPath: (d) => d.p, getColor: [56, 189, 248, 230], getWidth: 2, widthUnits: 'pixels' }),
      new TextLayer({
        id: 'sea', data: SEA_LABELS, getText: (d) => d.text, getPosition: (d) => d.position, getSize: 13, getColor: [148, 163, 184, 200],
        fontStyle: 'italic', fontFamily: 'system-ui, sans-serif', billboard: true,
      }),
    ];
    if (movement && use3d) {
      const cols = movement.columns;
      layers.push(new ColumnLayer({
        id: 'move-cols', data: cols, diskResolution: 4, angle: 45, radius: 270, coverage: 0.85, extruded: true, flatShading: true, pickable: true,
        getPosition: (c) => [c[0], c[1]],
        getElevation: (c) => Math.hypot(c[2], c[3]) * 30, // 1 cm of movement = 30 m tall
        getFillColor: (c) => rampColor(data.ramp, Math.hypot(c[2], c[3]), 235),
        material: { ambient: 0.55, diffuse: 0.6, shininess: 12 },
        transitions: { getElevation: { duration: 700 } },
        updateTriggers: { getElevation: [movement.url], getFillColor: [movement.url] },
      }));
    }
    // quakes: the ones inside this 12-day window are bright, older ones are grey
    if (use3d) {
      layers.push(new ColumnLayer({
        id: 'quakes-3d', data: shown, diskResolution: 16, radius: 450, extruded: true, pickable: true,
        getPosition: (q) => [q.lon, q.lat],
        getElevation: (q) => quakeHeight(q.mag),
        getFillColor: (q) => (q.id === selectedQuake ? [255, 255, 255, 240] : isNew(q) ? [239, 68, 68, 235] : [148, 163, 184, 120]),
        material: { ambient: 0.6, diffuse: 0.5, shininess: 8 },
        updateTriggers: { getFillColor: [pair.key, selectedQuake] },
      }));
    }
    layers.push(new ScatterplotLayer({
      id: 'quakes', data: shown, pickable: true, stroked: true, filled: true,
      getPosition: (q) => [q.lon, q.lat], getRadius: (q) => quakeRadius(q.mag), radiusMinPixels: 4,
      getFillColor: (q) => (isNew(q) ? [239, 68, 68, use3d ? 70 : 150] : [148, 163, 184, use3d ? 30 : 60]),
      getLineColor: (q) => (q.id === selectedQuake ? [255, 255, 255, 255] : isNew(q) ? [254, 202, 202, 230] : [148, 163, 184, 150]),
      lineWidthUnits: 'pixels', getLineWidth: (q) => (q.id === selectedQuake ? 3 : 1.5),
      updateTriggers: { getFillColor: [pair.key, use3d], getLineColor: [pair.key, selectedQuake], getLineWidth: [selectedQuake] },
    }));
    layers.push(new TextLayer({
      id: 'quake-mag', data: shown.filter((q) => q.mag >= 4.5 && (isNew(q) || q.id === selectedQuake)),
      getText: (q) => `M${q.mag}`, getPosition: (q) => [q.lon, q.lat, use3d ? quakeHeight(q.mag) : 0], getSize: 13, getColor: [255, 255, 255, 255],
      fontWeight: 700, fontFamily: 'system-ui, sans-serif', getPixelOffset: [0, -14], outlineWidth: 3, outlineColor: [11, 18, 32, 255],
      fontSettings: { sdf: true }, updateTriggers: { getPosition: [use3d] },
    }));
    layers.push(new ScatterplotLayer({
      id: 'towns', data: LG_TOWNS, getPosition: (t) => [t.lon, t.lat], getRadius: 3, radiusUnits: 'pixels',
      getFillColor: [255, 255, 255, 230], getLineColor: [11, 18, 32, 255], stroked: true, lineWidthUnits: 'pixels', getLineWidth: 1,
    }));
    layers.push(new TextLayer({
      // towns sit close together along the coast, so names alternate above and below their dot
      id: 'town-names', data: LG_TOWNS, getText: (t) => t.name, getPosition: (t) => [t.lon, t.lat], getSize: 12,
      getColor: [226, 232, 240, 255], getTextAnchor: 'middle',
      getAlignmentBaseline: (_, { index }) => (index % 2 ? 'top' : 'bottom'),
      getPixelOffset: (_, { index }) => [0, index % 2 ? 7 : -7],
      fontFamily: 'system-ui, sans-serif', outlineWidth: 3, outlineColor: [11, 18, 32, 255], fontSettings: { sdf: true },
      characterSet: 'auto',
    }));
    overlay.setProps({ layers });
  }, [data, pair, movement, use3d, selectedQuake]);

  return <div ref={containerRef} className="map" />;
}
