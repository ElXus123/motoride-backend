import { memo } from 'react';
import type { MedalDefinition } from '../lib/achievements';

/**
 * Medallas en pixel art (rejilla 32×32 escalada sin suavizado).
 *
 * Cada medalla = moneda pixelada con el color de la medalla + un sprite que representa el logro
 * (moto, casco, carretera, señal de curvas, velocímetro, tortuga, herradura, concha del Camino…)
 * + una cinta con la cifra cuando el logro tiene escalones (km, curvas, km/h, grados, nivel).
 */

type Props = {
  def: MedalDefinition;
  size?: number;
  className?: string;
};

const N = 32;
type Grid = (string | null)[][];

/* ───────────── utilidades de dibujo ───────────── */

function newGrid(): Grid {
  return Array.from({ length: N }, () => Array<string | null>(N).fill(null));
}

function put(g: Grid, x: number, y: number, c: string | null) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= N || yi >= N || c == null) return;
  g[yi][xi] = c;
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: string) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    put(g, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Rellena celdas cuyo centro cumple `test(dx, dy)` respecto a (cx, cy). */
function fillWhere(g: Grid, cx: number, cy: number, r: number, c: string, test: (d: number, dx: number, dy: number) => boolean) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (test(d, dx, dy)) put(g, x, y, c);
    }
  }
}

function disc(g: Grid, cx: number, cy: number, r: number, c: string) {
  fillWhere(g, cx, cy, r, c, (d) => d <= r);
}

function ring(g: Grid, cx: number, cy: number, r0: number, r1: number, c: string) {
  fillWhere(g, cx, cy, r1, c, (d) => d > r0 && d <= r1);
}

/** Dibuja filas de texto: cada carácter es una clave de paleta ('.' = vacío). */
function rows(g: Grid, ox: number, oy: number, art: string[], pal: Record<string, string>) {
  art.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch];
      if (c) put(g, ox + x, oy + y, c);
    }
  });
}

function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => {
    const t = amt < 0 ? 0 : 255;
    const p = Math.abs(amt);
    return Math.round((t - v) * p + v);
  };
  const r = ch((n >> 16) & 255);
  const gg = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1)}`;
}

/* ───────────── fuente pixel 3×5 para la cinta ───────────── */

const FONT: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  K: ['101', '110', '100', '110', '101'],
  '.': ['0', '0', '0', '0', '1'],
  '°': ['11', '11', '00', '00', '00'],
  X: ['101', '101', '010', '101', '101'],
};

function textWidth(t: string): number {
  let w = 0;
  for (const ch of t) w += (FONT[ch]?.[0].length ?? 3) + 1;
  return Math.max(0, w - 1);
}

function drawText(g: Grid, x: number, y: number, t: string, c: string) {
  let cx = x;
  for (const ch of t) {
    const glyph = FONT[ch];
    if (!glyph) {
      cx += 4;
      continue;
    }
    glyph.forEach((row, gy) => {
      for (let gx = 0; gx < row.length; gx++) if (row[gx] === '1') put(g, cx + gx, y + gy, c);
    });
    cx += glyph[0].length + 1;
  }
}

/* ───────────── paleta base de sprites ───────────── */

const K = '#07070b';
const BASE_PAL: Record<string, string> = {
  k: K,
  w: '#ffffff',
  l: '#d1d5db',
  g: '#9ca3af',
  d: '#4b5563',
  y: '#facc15',
  o: '#f97316',
  O: '#c2410c',
  R: '#ef4444',
  m: '#991b1b',
  b: '#93c5fd',
  B: '#2563eb',
  G: '#4ade80',
  e: '#15803d',
  n: '#7c4a1e',
  s: '#e5e7eb',
  S: '#94a3b8',
  h: '#fef3c7',
  p: '#c084fc',
};

type SpriteCtx = {
  g: Grid;
  /** Origen de la caja de 16×16 del sprite. */
  ox: number;
  oy: number;
  pal: Record<string, string>;
};

type Sprite = (c: SpriteCtx) => void;

const art = (a: string[], extra?: Record<string, string>): Sprite => (c) =>
  rows(c.g, c.ox, c.oy, a, extra ? { ...c.pal, ...extra } : c.pal);

/* ───────────── sprites (16×16) ───────────── */

const MOTO = art([
  '................',
  '................',
  '................',
  '............kk..',
  '...........k....',
  '....kk.....k....',
  '...kaakkkkkk....',
  '..krrrrrrrrrk...',
  '..kkrrrrrrrrkk..',
  '...kkddddkkkwwk.',
  '.kkkk.dddd.kkkk.',
  'kk..kkggggkk..kk',
  'k.ll.k....k.ll.k',
  'k.ll.k....k.ll.k',
  'kk..kk....kk..kk',
  '.kkkk......kkkk.',
]);

const HELMET = art([
  '................',
  '................',
  '.....kkkkkk.....',
  '...kkrrrrrrkk...',
  '..krrrrrrrrrrk..',
  '.krraarrrrrrrrk.',
  '.kraarrrrrrrrrk.',
  'krrarrrrkkkkkkkk',
  'krrrrrrkbbbbbbbk',
  'krrrrrrkbwbbbbbk',
  'krrrrrrkbbbbbbbk',
  'krrrrrrrkkkkkkkk',
  '.krrrrrrrrrrrk..',
  '.kkrrrrrrrrrkk..',
  '...kkkkkkkkkk...',
  '................',
]);

const FLAG = art([
  '................',
  '.a..............',
  '.kwwrrwwrrwwrr..',
  '.kwwrrwwrrwwrr..',
  '.krrwwrrwwrrww..',
  '.krrwwrrwwrrww..',
  '.kwwrrwwrrwwrr..',
  '.kwwrrwwrrwwrr..',
  '.krrwwrrwwrrww..',
  '.krrwwrrwwrrww..',
  '.k..............',
  '.k..............',
  '.k..............',
  '.k..............',
  '.k..............',
  'kkk.............',
]);

const ROAD: Sprite = ({ g, ox, oy, pal }) => {
  // Montañas al fondo
  rows(g, ox, oy, ['...a........a...', '..aaa......aaa..', '.aaaaa....aaaaa.'], pal);
  const top = 3;
  for (let y = top; y < 16; y++) {
    const L = Math.max(0, 6 - Math.floor((y - top) / 2));
    const R = 15 - L;
    for (let x = L; x <= R; x++) put(g, ox + x, oy + y, pal.d);
    put(g, ox + L, oy + y, pal.w);
    put(g, ox + R, oy + y, pal.w);
    const dash = (y - top) % 4 < 2;
    if (dash) {
      put(g, ox + 7, oy + y, pal.y);
      put(g, ox + 8, oy + y, pal.y);
    }
  }
};

const CURVE_SIGN = art([
  '.......kk.......',
  '......kyyk......',
  '.....kyyyyk.....',
  '....kyyykyyk....',
  '...kyyykkkyyk...',
  '..kyyyyykkyyyk..',
  '.kyyyyykkyyyyyk.',
  'kyyyyykkyyyyyyyk',
  'kyyyyykkyyyyyyyk',
  '.kyyyyykkyyyyyk.',
  '..kyyyyykkyyyk..',
  '...kyyyykkyyk...',
  '....kyykkyyk....',
  '.....kykkyk.....',
  '......kyyk......',
  '.......kk.......',
]);

/** Velocímetro con la aguja según el nivel (0 = izquierda, 1 = derecha). */
const gauge = (frac: number): Sprite => ({ g, ox, oy, pal }) => {
  const cx = ox + 7.5;
  const cy = oy + 10.5;
  fillWhere(g, cx, cy, 8, K, (d, _dx, dy) => d <= 8 && dy <= 0.6);
  fillWhere(g, cx, cy, 7, pal.d, (d, _dx, dy) => d <= 7 && dy <= 0.6);
  // Arco de escala: blanco → amarillo → rojo
  fillWhere(g, cx, cy, 7, pal.w, (d, dx, dy) => {
    if (d <= 5.6 || d > 7 || dy > 0.6) return false;
    const a = Math.atan2(-dy, dx); // π (izq) … 0 (der)
    return a > Math.PI * 0.5;
  });
  fillWhere(g, cx, cy, 7, pal.y, (d, dx, dy) => {
    if (d <= 5.6 || d > 7 || dy > 0.6) return false;
    const a = Math.atan2(-dy, dx);
    return a <= Math.PI * 0.5 && a > Math.PI * 0.22;
  });
  fillWhere(g, cx, cy, 7, pal.R, (d, dx, dy) => {
    if (d <= 5.6 || d > 7 || dy > 0.6) return false;
    const a = Math.atan2(-dy, dx);
    return a <= Math.PI * 0.22;
  });
  const ang = Math.PI * (1 - frac);
  line(g, cx, cy, cx + Math.cos(ang) * 5.2, cy - Math.sin(ang) * 5.2, pal.o);
  line(g, cx + 0.5, cy, cx + 0.5 + Math.cos(ang) * 5.2, cy - Math.sin(ang) * 5.2, pal.o);
  disc(g, cx, cy, 1.2, pal.w);
  for (let x = 0; x < 16; x++) put(g, ox + x, oy + 11, K);
};

const TURTLE = art([
  '................',
  '................',
  '................',
  '................',
  '....kkkkkk......',
  '...kGGeeGGk.....',
  '..kGeGGGGeGk.kk.',
  '.kGGeGGGGeGGkGGk',
  '.kGeeeeeeeeGkGwk',
  'kkkkkkkkkkkkkGGk',
  '.khhhhhhhhhhk...',
  '.kGGk....kGGk...',
  '.kkk......kkk...',
  '................',
  '................',
  '................',
]);

const SHIELD = art([
  '................',
  '..kkkkkkkkkkkk..',
  '..kGGGGGGGGGGk..',
  '..kGGGGGGGGGGk..',
  '..kGGGGGGGGwwk..',
  '..kGGGGGGGwwGk..',
  '..kGwwGGGwwGGk..',
  '..kGGwwGwwGGGk..',
  '..kGGGwwwGGGGk..',
  '...kGGGwGGGGk...',
  '...kGGGGGGGGk...',
  '....kGGGGGGk....',
  '.....kGGGGk.....',
  '......kGGk......',
  '.......kk.......',
  '................',
]);

const BOLT = art([
  '................',
  '.........kkkk...',
  '........kyyyk...',
  'aaa....kyyyk....',
  '......kyyyk.....',
  '.....kyyyk......',
  '....kyyyykkkk...',
  '...kyyyyyyyyk...',
  '...kkkkkyyyk....',
  '.......kyyk.....',
  '......kyyk...aaa',
  '.....kyyk.......',
  '....kyyk........',
  '...kyk.....aa...',
  '...kk...........',
  '................',
]);

/** Moto tumbada: `deg` grados respecto a la vertical, con arco del ángulo. */
const lean = (deg: number): Sprite => ({ g, ox, oy, pal }) => {
  const px = ox + 4;
  const py = oy + 14;
  for (let x = 0; x < 16; x++) put(g, ox + x, py + 1, pal.w);
  const a = (deg * Math.PI) / 180;
  const len = 11;
  const tx = px + Math.sin(a) * len;
  const ty = py - Math.cos(a) * len;
  // Arco entre la vertical y la moto
  for (let t = 0; t <= a; t += 0.05) {
    put(g, px + Math.sin(t) * 6, py - Math.cos(t) * 6, pal.y);
  }
  line(g, px, py, px, py - 7, pal.d);
  // Cuerpo de la moto (grueso)
  line(g, px, py, tx, ty, K);
  line(g, px + 1, py, tx + 1, ty, pal.r);
  line(g, px + 2, py, tx + 2, ty, pal.r);
  line(g, px + 3, py, tx + 3, ty, K);
  disc(g, px + 1.5, py - 0.5, 1.6, K);
  disc(g, tx + 1.5, ty, 1.4, pal.a);
  // Chispas de la rodillera
  put(g, px + 6, py - 1, pal.o);
  put(g, px + 8, py - 2, pal.y);
  put(g, px + 7, py, pal.o);
};

const HORSESHOE = art([
  '................',
  '................',
  '..kkk......kkk..',
  '.kssk......kssk.',
  '.ksdk......kdsk.',
  'kssk........kssk',
  'ksdk........kdsk',
  'kssk........kssk',
  'ksdk........kdsk',
  'kssk........kssk',
  'kssk........kssk',
  '.ksskk....kkssk.',
  '.kssssssssssssk.',
  '..kssssssssssk..',
  '....kkkkkkkk....',
  '................',
]);

const trophy = (metal: string): Sprite =>
  art(
    [
      '................',
      '................',
      'kkkkTTTTTTTTkkkk',
      'kT.kTwTTTTTTk.Tk',
      'kT.kTwTTTTTTk.Tk',
      '.kTkTTTTTTTTkTk.',
      '..kkTTTTTTTTkk..',
      '....kTTTTTTk....',
      '.....kTTTTk.....',
      '......kTTk......',
      '......kTTk......',
      '.....kTTTTk.....',
      '....kkkkkkkk....',
      '....kddddddk....',
      '....kkkkkkkk....',
      '................',
    ],
    { T: metal }
  );

const SHELL: Sprite = ({ g, ox, oy, pal }) => {
  const cx = ox + 7.5;
  const by = oy + 13;
  // Abanico
  fillWhere(g, cx, by, 10, K, (d, _dx, dy) => d <= 10 && dy <= 0);
  fillWhere(g, cx, by, 9, pal.y, (d, _dx, dy) => d <= 9 && dy <= 0);
  for (const deg of [-62, -36, -12, 12, 36, 62]) {
    const a = (deg * Math.PI) / 180;
    line(g, cx, by - 1, cx + Math.sin(a) * 8, by - 1 - Math.cos(a) * 8, pal.O);
  }
  // Borde ondulado
  for (let x = -9; x <= 9; x += 3) put(g, cx + x, by - Math.sqrt(Math.max(0, 81 - x * x)), pal.h);
  // Charnela
  rows(g, ox, by, ['....kkkkkkkk....', '.....kyyyyk.....', '......kkkk......'], pal);
};

const COFFEE = art([
  '................',
  '................',
  '................',
  '....w..w..w.....',
  '.....w..w..w....',
  '....w..w..w.....',
  '................',
  '..kkkkkkkkkk....',
  '..kwwwwwwwwkkk..',
  '..kwnnnnnnwk.k..',
  '..kwwwwwwwwk.k..',
  '..kwwwwwwwwkkk..',
  '...kwwwwwwk.....',
  '.kkkkkkkkkkkk...',
  '..kssssssssk....',
  '...kkkkkkkk.....',
]);

const DIAMOND: Sprite = ({ g, ox, oy, pal }) => {
  rows(
    g,
    ox,
    oy,
    [
      '.............w..',
      '............www.',
      '.............w..',
      '....kkkkkkkk....',
      '...kwbbwbbwbk...',
      '..kwbbwbbwbbbk..',
      '.kkkkkkkkkkkkkk.',
      '..kbwbbbbbbbbk..',
      '...kbwbbbbbbk...',
      '....kbwbbbbk....',
      '.....kbwbbk.....',
      '......kbbk......',
      '.......kk.......',
      '..w.............',
      '.www............',
      '..w.............',
    ],
    pal
  );
};

const CROWN = art([
  '................',
  '................',
  '................',
  '................',
  '..k....k....k...',
  '.kyk..kyk..kyk..',
  '.kyyk.kyk.kyyk..',
  '.kyyykyyykyyyk..',
  '.kyyyyyyyyyyyk..',
  '.kyRyyyByyyRyk..',
  '.kyyyyyyyyyyyk..',
  '.kkkkkkkkkkkkk..',
  '................',
  '................',
  '................',
  '................',
]);

const DICE = art([
  '................',
  '................',
  '...kkkkkkkkkk...',
  '..kwwwwwwwwwwk..',
  '..kwkkwwwwkkwk..',
  '..kwkkwwwwkkwk..',
  '..kwwwwwwwwwwk..',
  '..kwwwwRRwwwwk..',
  '..kwwwwRRwwwwk..',
  '..kwwwwwwwwwwk..',
  '..kwkkwwwwkkwk..',
  '..kwkkwwwwkkwk..',
  '..kwwwwwwwwwwk..',
  '...kkkkkkkkkk...',
  '................',
  '................',
]);

const MOON: Sprite = ({ g, ox, oy, pal }) => {
  const cx = ox + 7;
  const cy = oy + 8;
  disc(g, cx, cy, 6.4, K);
  disc(g, cx, cy, 5.6, pal.h);
  // Recortar el creciente: '' = transparente
  fillWhere(g, cx + 3, cy - 2.2, 5, '', (d) => d <= 4.8);
  for (const [x, y] of [
    [12, 2],
    [14, 6],
    [11, 12],
    [3, 1],
  ]) {
    put(g, ox + x, oy + y, pal.y);
  }
  put(g, ox + 13, oy + 2, pal.w);
  put(g, ox + 12, oy + 1, pal.w);
  put(g, ox + 12, oy + 3, pal.w);
  put(g, ox + 11, oy + 2, pal.w);
};

const COMPASS: Sprite = ({ g, ox, oy, pal }) => {
  const cx = ox + 7.5;
  const cy = oy + 7.5;
  disc(g, cx, cy, 7.4, K);
  disc(g, cx, cy, 6.5, pal.h);
  ring(g, cx, cy, 5.4, 6.5, pal.a);
  // Aguja: norte rojo, sur blanco
  for (let i = 0; i <= 5; i++) {
    const w = Math.max(0, 1.6 - i * 0.3);
    line(g, cx - w, cy - i, cx + w, cy - i, pal.R);
    line(g, cx - w, cy + i, cx + w, cy + i, pal.d);
  }
  put(g, cx, cy, K);
  put(g, cx, oy - 0.5, pal.w);
};

const GEAR: Sprite = ({ g, ox, oy, pal }) => {
  const cx = ox + 7.5;
  const cy = oy + 7.5;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    disc(g, cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 1.7, K);
  }
  disc(g, cx, cy, 6.2, K);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    disc(g, cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 1.1, pal.S);
  }
  disc(g, cx, cy, 5.3, pal.S);
  ring(g, cx, cy, 3.2, 4.2, pal.l);
  disc(g, cx, cy, 2.2, K);
};

const CROSSHAIR: Sprite = ({ g, ox, oy, pal }) => {
  const cx = ox + 7.5;
  const cy = oy + 7.5;
  CURVE_SIGN_SMALL({ g, ox: ox + 4, oy: oy + 4, pal });
  ring(g, cx, cy, 6, 7.2, pal.R);
  line(g, cx, oy - 0.5, cx, oy + 3, pal.R);
  line(g, cx, oy + 12, cx, oy + 15.5, pal.R);
  line(g, ox - 0.5, cy, ox + 3, cy, pal.R);
  line(g, ox + 12, cy, ox + 15.5, cy, pal.R);
};

/** Trazado en chicane con salida (blanca) y meta (roja): la “trazada” ideal. */
const TRACE: Sprite = ({ g, ox, oy, pal }) => {
  const path: [number, number][] = [
    [2, 13],
    [6, 8],
    [9, 6],
    [12, 10],
    [13, 3],
  ];
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1];
    const [x1, y1] = path[i];
    line(g, ox + x0, oy + y0 + 1, ox + x1, oy + y1 + 1, K);
    line(g, ox + x0, oy + y0, ox + x1, oy + y1, pal.a);
  }
  disc(g, ox + 2, oy + 13, 1.4, pal.w);
  disc(g, ox + 13, oy + 3, 1.4, pal.R);
};

const CURVE_SIGN_SMALL = art([
  '...kk...',
  '..kyyk..',
  '.kykyyk.',
  'kyykkyyk',
  'kyykkyyk',
  '.kyykyk.',
  '..kyyk..',
  '...kk...',
]);

/* ───────────── qué sprite y cifra lleva cada medalla ───────────── */

type MedalLook = { sprite: Sprite; label?: string };

const KM_LABEL: Record<string, string> = {
  ten_km: '10',
  twentyfive_km: '25',
  fifty_km: '50',
  one_hundred_km: '100',
  two_hundred_km: '200',
  three_hundred_km: '300',
  five_hundred_km: '500',
  seven_hundred_fifty_km: '750',
  one_thousand_km: '1K',
  one_thousand_five_hundred_km: '1.5K',
  two_thousand_five_hundred_km: '2.5K',
  five_thousand_km: '5K',
};

const CURVES_LABEL: Record<string, string> = {
  ten_curves: '10',
  twentyfive_curves: '25',
  one_hundred_curves: '100',
  two_hundred_fifty_curves: '250',
  five_hundred_curves: '500',
  one_thousand_curves: '1K',
};

const LEVEL_LABEL: Record<string, string> = {
  level_3: '3',
  level_5: '5',
  level_10: '10',
  level_15: '15',
  level_20: '20',
  level_25: '25',
};

function lookFor(id: string): MedalLook {
  if (KM_LABEL[id]) return { sprite: ROAD, label: KM_LABEL[id] };
  if (CURVES_LABEL[id]) return { sprite: CURVE_SIGN, label: CURVES_LABEL[id] };
  if (LEVEL_LABEL[id]) return { sprite: CROWN, label: LEVEL_LABEL[id] };
  switch (id) {
    case 'first_ride':
      return { sprite: MOTO, label: '1' };
    case 'twenty_rides':
      return { sprite: MOTO, label: '20' };
    case 'lean_20':
      return { sprite: lean(20), label: '20°' };
    case 'trazada':
      return { sprite: TRACE };
    case 'ten_rides':
      return { sprite: HELMET, label: '10' };
    case 'fifty_rides':
      return { sprite: FLAG, label: '50' };
    case 'speed_safe':
      return { sprite: SHIELD };
    case 'speed_turtle':
      return { sprite: TURTLE };
    case 'club_80':
      return { sprite: gauge(0.45), label: '80' };
    case 'speed_hundred':
      return { sprite: gauge(0.62), label: '100' };
    case 'speed_over_120':
      return { sprite: gauge(0.8), label: '120' };
    case 'huracan':
      return { sprite: BOLT, label: '150' };
    case 'lean_30':
      return { sprite: lean(30), label: '30°' };
    case 'lean_epic_45':
      return { sprite: lean(45), label: '45°' };
    case 'lean_line':
      return { sprite: lean(55), label: '55°' };
    case 'mule':
      return { sprite: HORSESHOE };
    case 'silver_road':
      return { sprite: trophy('#e2e8f0') };
    case 'gold_odyssey':
      return { sprite: trophy('#facc15') };
    case 'curve_hunter':
      return { sprite: CROSSHAIR };
    case 'compass_rose':
      return { sprite: COMPASS };
    case 'peregrino':
      return { sprite: SHELL };
    case 'chain_master':
      return { sprite: GEAR };
    case 'coffee_loop':
      return { sprite: COFFEE };
    case 'mirror_polish':
      return { sprite: DIAMOND };
    case 'night_style':
      return { sprite: MOON };
    case 'wildcard':
      return { sprite: DICE };
    default:
      return { sprite: trophy('#facc15') };
  }
}

/* ───────────── composición de la medalla ───────────── */

function buildMedal(def: MedalDefinition): Grid {
  const g = newGrid();
  const ringC = def.ring;
  const ringDark = shade(ringC, -0.38);
  const ringLight = shade(ringC, 0.35);
  const core = def.core;
  const coreLight = shade(core, 0.1);
  const c = 15.5;

  // Moneda: contorno, aro con luz arriba-izquierda y sombra abajo-derecha, centro con bisel
  fillWhere(g, c, c, 15.6, K, (d) => d <= 15.6);
  fillWhere(g, c, c, 14.6, ringC, (d) => d <= 14.6);
  fillWhere(g, c, c, 14.6, ringLight, (d, dx, dy) => d <= 14.6 && d > 12.4 && dx + dy < -9);
  fillWhere(g, c, c, 14.6, ringDark, (d, dx, dy) => d <= 14.6 && d > 12.4 && dx + dy > 9);
  // Remaches del aro
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    put(g, c + Math.cos(a) * 13.5, c + Math.sin(a) * 13.5, def.accent);
  }
  fillWhere(g, c, c, 12.4, K, (d) => d <= 12.4);
  fillWhere(g, c, c, 11.6, core, (d) => d <= 11.6);
  // Tramado suave en el centro (look retro)
  fillWhere(g, c, c, 11.6, coreLight, (d, dx, dy) => d <= 11.6 && dx + dy < 0 && (Math.round(dx) + Math.round(dy)) % 2 === 0);

  const look = lookFor(def.id);
  const pal: Record<string, string> = { ...BASE_PAL, a: def.accent, r: ringC };
  const hasLabel = !!look.label;
  look.sprite({ g, ox: 8, oy: hasLabel ? 5 : 8, pal });

  if (look.label) {
    const tw = textWidth(look.label);
    const x0 = Math.floor(16 - tw / 2) - 3;
    const x1 = x0 + tw + 5;
    const y0 = 23;
    const y1 = 29;
    // Colas de la cinta
    for (let y = y0 + 2; y <= y1 - 1; y++) {
      put(g, x0 - 2, y, K);
      put(g, x1 + 2, y, K);
      put(g, x0 - 1, y, ringDark);
      put(g, x1 + 1, y, ringDark);
    }
    put(g, x0 - 1, y0 + 1, K);
    put(g, x1 + 1, y0 + 1, K);
    put(g, x0 - 1, y1, K);
    put(g, x1 + 1, y1, K);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const edge = y === y0 || y === y1 || x === x0 || x === x1;
        put(g, x, y, edge ? K : y === y0 + 1 ? ringLight : ringC);
      }
    }
    drawText(g, x0 + 3, y0 + 1, look.label, K);
    drawText(g, x0 + 3, y0 + 1, look.label, '#ffffff');
  }
  return g;
}

/** Convierte la rejilla en rects (uniendo tramos del mismo color por fila). */
function toRects(g: Grid): { x: number; y: number; w: number; c: string }[] {
  const out: { x: number; y: number; w: number; c: string }[] = [];
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const c = g[y][x];
      if (!c) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < N && g[y][x + w] === c) w++;
      out.push({ x, y, w, c });
      x += w;
    }
  }
  return out;
}

const cache = new Map<string, { x: number; y: number; w: number; c: string }[]>();

export function medalRects(def: MedalDefinition) {
  const key = `${def.id}|${def.ring}|${def.core}|${def.accent}`;
  let r = cache.get(key);
  if (!r) {
    r = toRects(buildMedal(def));
    cache.set(key, r);
  }
  return r;
}

function MedalGlyph({ def, size = 56, className = '' }: Props) {
  const rects = medalRects(def);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${N} ${N}`}
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label={def.title}
      style={{ imageRendering: 'pixelated' }}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />
      ))}
    </svg>
  );
}

export default memo(MedalGlyph);
