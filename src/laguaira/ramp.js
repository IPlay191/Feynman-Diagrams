// Color for "how far the ground moved" (cm). `ramp` comes from laguaira.json: [[cm, [r,g,b,a]], ...]
export function rampColor(ramp, v, alpha) {
  let c = ramp.at(-1)[1];
  if (v <= ramp[0][0]) c = ramp[0][1];
  else {
    for (let i = 1; i < ramp.length; i++) {
      if (v <= ramp[i][0]) {
        const [a, ca] = ramp[i - 1], [b, cb] = ramp[i];
        const t = (v - a) / (b - a);
        c = ca.map((x, j) => Math.round(x + (cb[j] - x) * t));
        break;
      }
    }
  }
  return alpha === undefined ? c : [c[0], c[1], c[2], alpha];
}

export const rampCss = (ramp) =>
  `linear-gradient(90deg, ${ramp.map(([v, c]) => `rgb(${c[0]},${c[1]},${c[2]}) ${Math.round((v / ramp.at(-1)[0]) * 100)}%`).join(', ')})`;
