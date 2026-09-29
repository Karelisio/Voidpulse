/** Couleurs perceptuelles (OKLab / OKLCH) : palettes tonales, conversions hexadécimales. */

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toLin = (c: number): number => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};

const fromLin = (x: number): number => {
  const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return Math.round(255 * Math.min(1, Math.max(0, v)));
};

/** Hexadécimal → OKLCH [L 0-1, C, h en degrés]. */
export function hexToOklch(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

function oklchToLinear(L: number, C: number, h: number): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH → hexadécimal ; la chroma est réduite jusqu'à tenir dans le gamut sRGB. */
export function oklchToHex(L: number, C: number, h: number): string {
  let c = C;
  let rgb = oklchToLinear(L, c, h);
  for (let i = 0; i < 24 && rgb.some((v) => v < -0.0005 || v > 1.0005); i++) {
    c *= 0.9;
    rgb = oklchToLinear(L, c, h);
  }
  return `#${rgb.map((v) => fromLin(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Ton (0-100, luminance perceptuelle) d'une teinte : palette tonale à la manière de Material 3. */
export function tone(seed: string, t: number, chroma?: number, hueShift = 0): string {
  const [, c, h] = hexToOklch(seed);
  return oklchToHex(t / 100, chroma ?? Math.min(c, 0.16), (h + hueShift + 360) % 360);
}

export const hexToNumber = (hex: string): number => parseInt(hex.slice(1), 16);
