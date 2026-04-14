/**
 * Genera icon-192.png e icon-512.png en /public desde ICONO.png (raíz del proyecto).
 * Requisito para PWA, TWA (Play Store) y listados de tienda.
 * Uso: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'ICONO.png');
const outDir = join(root, 'public');

if (!existsSync(src)) {
  console.error('No se encuentra ICONO.png en la raíz del proyecto.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const input = readFileSync(src);

for (const size of [192, 512]) {
  const dest = join(outDir, `icon-${size}.png`);
  await sharp(input)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .png()
    .toFile(dest);
  console.log('OK:', dest);
}

console.log('Iconos listos para manifest y Play Store.');
