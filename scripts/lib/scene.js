// Loads a downloaded NISAR browse PNG + KML and lets you sample pixels by longitude/latitude.
import fs from 'node:fs/promises';
import sharp from 'sharp';

export async function loadScene(basePath) {
  const kml = await fs.readFile(basePath + '.kml', 'utf8');
  const coords = kml.match(/<coordinates>([^<]+)<\/coordinates>/)[1].trim().split(/\s+/).map((s) => s.split(',').map(Number));
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const bounds = { west: Math.min(...lons), east: Math.max(...lons), south: Math.min(...lats), north: Math.max(...lats) };
  const { data, info } = await sharp(basePath + '.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  // Returns [r, g, b, a] of the pixel under (lon, lat), or null when outside the image.
  function sample(lon, lat) {
    const x = Math.floor(((lon - bounds.west) / (bounds.east - bounds.west)) * width);
    const y = Math.floor(((bounds.north - lat) / (bounds.north - bounds.south)) * height);
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  }

  return { bounds, width, height, sample, pixelDeg: (bounds.east - bounds.west) / width };
}
