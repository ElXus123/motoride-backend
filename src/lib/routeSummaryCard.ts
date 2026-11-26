/**
 * Tarjeta de resumen de ruta (PNG 1080x1920) para compartir.
 *
 * Privacidad: solo muestra datos de la ruta (nombre del grupo, distancia, tiempo, curvas, inclinacion
 * maxima, puntos y el trazado). No incluye email, nombre completo ni gastos.
 *
 * Paleta y tipografia tomadas de src/index.css (sistema «mapa de carretera impreso»: crema, tinta y ambar;
 * Barlow Condensed / Plus Jakarta Sans).
 */

export type RouteSummaryInput = {
  score?: number;
  baseScore?: number;
  distanceBonus?: number;
  /** Kilometros. */
  distance: number;
  /** Milisegundos. */
  duration: number;
  leftTurns: number;
  rightTurns: number;
  maxLeanLeft: number;
  maxLeanRight: number;
};

export type RouteSummaryCardParams = {
  data: RouteSummaryInput;
  /** Nombre de la ruta (nombre del grupo), sin datos personales. */
  routeName: string;
  /** Trazado [lon, lat][]; si esta vacio no se dibuja el mapa. */
  routeCoords: number[][];
  logo: HTMLImageElement | null;
};

const DISPLAY_FONT = '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif';
const BODY_FONT = '"Plus Jakarta Sans", system-ui, "Segoe UI", Roboto, sans-serif';

/** Paleta crema y ambar (tokens --color-mr-*). El ambar de texto usa la variante oscura para contraste sobre crema. */
const C = {
  bgTop: '#f4efe6',
  bgMid: '#fbf8f2',
  bgBottom: '#f4efe6',
  paper: '#fbf8f2',
  orange: '#f58a1f',
  orangeText: '#a44e08',
  orangeSoft: '#f58a1f',
  text: '#14110e',
  textSoft: '#14110e',
  muted: '#5c5548',
  fill: 'rgba(20, 17, 14, 0.04)',
  line: 'rgba(20, 17, 14, 0.13)',
  mint: '#1f7a52',
};

async function ensureFonts(): Promise<void> {
  try {
    if (typeof document !== 'undefined' && document.fonts) {
      await Promise.all([
        document.fonts.load(`700 52px ${DISPLAY_FONT}`),
        document.fonts.load(`600 20px ${BODY_FONT}`),
      ]);
    }
  } catch {
    /* se usan las fuentes de respaldo */
  }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** Dibuja el trazado escalado para caber en la caja (proyeccion equirectangular con correccion de coseno). */
function drawRouteTrack(ctx: CanvasRenderingContext2D, coords: number[][], bx: number, by: number, bw: number, bh: number) {
  const pts = coords.filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]));
  if (pts.length < 2) return;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of pts) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max(1e-9, (maxLng - minLng) * cos);
  const spanY = Math.max(1e-9, maxLat - minLat);
  const pad = 56;
  const scale = Math.min((bw - pad * 2) / spanX, (bh - pad * 2) / spanY);
  const offX = bx + (bw - spanX * scale) / 2;
  const offY = by + (bh - spanY * scale) / 2;
  const project = (lng: number, lat: number): [number, number] => [
    offX + (lng - minLng) * cos * scale,
    offY + (maxLat - lat) * scale,
  ];

  ctx.beginPath();
  pts.forEach(([lng, lat], i) => {
    const [x, y] = project(lng, lat);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(245, 138, 31, 0.22)';
  ctx.lineWidth = 20;
  ctx.stroke();
  ctx.strokeStyle = C.orangeSoft;
  ctx.lineWidth = 7;
  ctx.stroke();

  const [sx, sy] = project(pts[0][0], pts[0][1]);
  const [ex, ey] = project(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  ctx.fillStyle = C.mint;
  ctx.beginPath();
  ctx.arc(sx, sy, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.text;
  ctx.beginPath();
  ctx.arc(ex, ey, 13, 0, Math.PI * 2);
  ctx.fill();
}

/** Genera la tarjeta como PNG. Devuelve null si el canvas no esta disponible. */
export async function renderRouteSummaryCard(params: RouteSummaryCardParams): Promise<Blob | null> {
  const { data, routeName, routeCoords, logo } = params;
  await ensureFonts();

  const canvas = document.createElement('canvas');
  const width = 1080;
  const height = 1920;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, C.bgTop);
  bg.addColorStop(0.45, C.bgMid);
  bg.addColorStop(1, C.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.5, 0, 0, width * 0.5, 0, width * 0.85);
  glow.addColorStop(0, 'rgba(245, 138, 31, 0.16)');
  glow.addColorStop(1, 'rgba(245, 138, 31, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, 520);

  const pad = 72;
  const cardX = pad;
  const cardY = pad;
  const cardW = width - pad * 2;
  const cardH = height - pad * 2;

  ctx.shadowColor = 'rgba(20, 17, 14, 0.18)';
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = C.paper;
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 44);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgba(20, 17, 14, 0.13)';
  ctx.lineWidth = 2;
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 44);
  ctx.stroke();

  const hasLogo = !!logo && logo.width > 0;
  const headerY = cardY + 72;
  if (hasLogo && logo) {
    const lw = 120;
    const lh = (logo.height / logo.width) * lw;
    ctx.save();
    roundRectPath(ctx, cardX + 72, headerY, lw, lh, 22);
    ctx.clip();
    ctx.drawImage(logo, cardX + 72, headerY, lw, lh);
    ctx.restore();
  }

  const titleX = hasLogo ? cardX + 220 : cardX + 72;
  ctx.fillStyle = C.orangeText;
  ctx.font = `700 26px ${DISPLAY_FONT}`;
  ctx.fillText('RUTA COMPLETADA', titleX, headerY + 26);
  ctx.fillStyle = C.text;
  ctx.font = `700 60px ${DISPLAY_FONT}`;
  ctx.fillText((routeName || 'Ruta MotoRide').slice(0, 36), titleX, headerY + 88);

  const score = data.score ?? 0;
  const baseScore = data.baseScore ?? score;
  const bonus = data.distanceBonus ?? 0;
  const averageSpeed = data.duration > 0 ? Math.round(data.distance / (data.duration / 3600000)) : 0;
  const mins = Math.floor(data.duration / 60000);
  const secs = Math.floor((data.duration % 60000) / 1000);

  const drawStat = (bx: number, by: number, bw: number, bh: number, label: string, value: string, accent: string) => {
    ctx.fillStyle = C.fill;
    roundRectPath(ctx, bx, by, bw, bh, 20);
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    roundRectPath(ctx, bx, by, bw, bh, 20);
    ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.font = `600 20px ${BODY_FONT}`;
    ctx.fillText(label.toUpperCase(), bx + 28, by + 40);
    ctx.fillStyle = accent;
    ctx.font = `700 50px ${DISPLAY_FONT}`;
    ctx.fillText(value, bx + 28, by + 100);
  };

  const gridTop = headerY + (hasLogo ? 160 : 120);
  const colGap = 22;
  const rowGap = 22;
  const cellW = (cardW - 72 * 2 - colGap) / 2;
  const cellH = 132;
  const gx = cardX + 72;
  let gy = gridTop;

  drawStat(gx, gy, cellW, cellH, 'Distancia', `${data.distance} km`, C.textSoft);
  drawStat(gx + cellW + colGap, gy, cellW, cellH, 'Tiempo', `${mins}m ${secs}s`, C.textSoft);
  gy += cellH + rowGap;
  drawStat(gx, gy, cellW, cellH, 'Vel. media', `${averageSpeed} km/h`, C.textSoft);
  drawStat(gx + cellW + colGap, gy, cellW, cellH, 'Curvas I / D', `${data.leftTurns} / ${data.rightTurns}`, C.textSoft);
  gy += cellH + rowGap;
  drawStat(gx, gy, cellW, cellH, 'Puntos base', `+${baseScore}`, C.textSoft);
  drawStat(gx + cellW + colGap, gy, cellW, cellH, 'Bonus dist.', bonus > 0 ? `+${bonus}` : '—', C.mint);
  gy += cellH + rowGap;

  const wideH = 168;
  const wideW = cellW * 2 + colGap;
  ctx.fillStyle = C.fill;
  roundRectPath(ctx, gx, gy, wideW, wideH, 20);
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  roundRectPath(ctx, gx, gy, wideW, wideH, 20);
  ctx.stroke();
  ctx.fillStyle = C.muted;
  ctx.font = `600 20px ${BODY_FONT}`;
  ctx.fillText('INCLINACIÓN MÁXIMA', gx + 28, gy + 42);
  ctx.fillStyle = C.text;
  ctx.font = `700 56px ${DISPLAY_FONT}`;
  ctx.fillText(`Izq. ${data.maxLeanLeft}°   ·   Der. ${data.maxLeanRight}°`, gx + 28, gy + 110);

  gy += wideH + 36;
  ctx.fillStyle = C.orangeText;
  ctx.font = `700 64px ${DISPLAY_FONT}`;
  ctx.fillText(`+${score} puntos`, gx, gy + 12);

  // Trazado de la ruta (si la ruta tiene geometria y hay espacio).
  const trackY = gy + 48;
  const trackBottom = cardY + cardH - 120;
  if (routeCoords.length >= 2 && trackBottom - trackY > 200) {
    ctx.fillStyle = 'rgba(245, 138, 31, 0.06)';
    roundRectPath(ctx, gx, trackY, wideW, trackBottom - trackY, 28);
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    roundRectPath(ctx, gx, trackY, wideW, trackBottom - trackY, 28);
    ctx.stroke();
    drawRouteTrack(ctx, routeCoords, gx, trackY, wideW, trackBottom - trackY);
  }

  ctx.fillStyle = C.muted;
  ctx.font = `600 24px ${BODY_FONT}`;
  ctx.fillText('MotoRide · Conduce con seguridad', cardX + 72, cardY + cardH - 56);

  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
}

/** Carga el logo para la tarjeta; si falla se dibuja sin logo. */
export function loadSummaryLogo(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    } catch {
      resolve(null);
    }
  });
}
