// Cuts a map picture down to one area: crops it to the area's bounding box and makes everything
// outside the area's outline transparent. Used when someone focuses on Downtown, Miami Beach or
// the Everglades, so nothing from the other areas shows.
import { REGIONS, regionBBox, boundsToCorners } from '../../shared/regions.js';

const cache = new Map();
const MAX_SIDE = 1024; // keeps the cut-out pictures small and fast to draw

export const cornersToBounds = (c) => ({ west: c[0][0], north: c[0][1], east: c[1][0], south: c[2][1] });

export function clipPicture(url, bounds, regionId, { smooth = true, minSide = 384 } = {}) {
  const key = `${url}|${regionId}|${smooth}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const [w, s, e, n] = regionBBox(regionId);
      const pad = 0.004;
      const crop = {
        west: Math.max(bounds.west, w - pad), east: Math.min(bounds.east, e + pad),
        south: Math.max(bounds.south, s - pad), north: Math.min(bounds.north, n + pad),
      };
      if (crop.west >= crop.east || crop.south >= crop.north) return null; // area outside this picture

      const img = new Image();
      img.src = url;
      await img.decode();
      const kx = img.width / (bounds.east - bounds.west);
      const ky = img.height / (bounds.north - bounds.south);
      const sx = Math.floor((crop.west - bounds.west) * kx);
      const sy = Math.floor((bounds.north - crop.north) * ky);
      const sw = Math.max(1, Math.ceil((crop.east - bounds.west) * kx) - sx);
      const sh = Math.max(1, Math.ceil((bounds.north - crop.south) * ky) - sy);
      // the exact area covered by the whole source pixels we cut out
      const cut = {
        west: bounds.west + sx / kx, east: bounds.west + (sx + sw) / kx,
        north: bounds.north - sy / ky, south: bounds.north - (sy + sh) / ky,
      };
      const scale = Math.min(MAX_SIDE / Math.max(sw, sh), Math.max(1, minSide / Math.max(sw, sh)));
      const ow = Math.max(1, Math.round(sw * scale));
      const oh = Math.max(1, Math.round(sh * scale));

      const canvas = document.createElement('canvas');
      canvas.width = ow;
      canvas.height = oh;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = smooth;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, ow, oh);
      // keep only what is inside the area's outline
      ctx.globalCompositeOperation = 'destination-in';
      ctx.beginPath();
      REGIONS[regionId].polygon.forEach(([lon, lat], i) => {
        const x = ((lon - cut.west) / (cut.east - cut.west)) * ow;
        const y = ((cut.north - lat) / (cut.north - cut.south)) * oh;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = '#000';
      ctx.fill();
      return { url: canvas.toDataURL('image/png'), corners: boundsToCorners(cut) };
    })().catch((e) => { cache.delete(key); throw e; }));
  }
  return cache.get(key);
}
