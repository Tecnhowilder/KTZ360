import fs from 'fs';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svgPath = path.resolve(__dirname, '../public/icons/fondo trasnparente  Shelwi.svg');
const svg = fs.readFileSync(svgPath);
const outputDir = path.resolve(__dirname, '../public/icons');

const assets = [
  { name: 'logo-light.png', width: 300, height: 300, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  { name: 'logo-dark.png', width: 300, height: 300, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  { name: 'logo-icon.png', width: 120, height: 120, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  { name: 'icon-192.png', width: 192, height: 192, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  { name: 'icon-512.png', width: 512, height: 512, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  { name: 'maskable-icon.png', width: 512, height: 512, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  { name: 'apple-touch-icon.png', width: 180, height: 180, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  { name: 'mstile-150x150.png', width: 150, height: 150, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  { name: 'favicon-16.png', width: 16, height: 16, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  { name: 'favicon-32.png', width: 32, height: 32, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  { name: 'favicon-48.png', width: 48, height: 48, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  { name: 'favicon-64.png', width: 64, height: 64, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  { name: 'og-cover.png', width: 1200, height: 630, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  { name: 'splash-1080x1920.png', width: 1080, height: 1920, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  { name: 'splash-1179x2556.png', width: 1179, height: 2556, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  { name: 'splash-1290x2796.png', width: 1290, height: 2796, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  { name: 'splash-2048x2732.png', width: 2048, height: 2732, background: { r: 0, g: 0, b: 0, alpha: 1 } },
];

Promise.all(
  assets.map(({ name, width, height, background }) => {
    const outPath = path.join(outputDir, name);
    return sharp(svg)
      .resize(width, height, { fit: 'contain', background })
      .flatten({ background })
      .png()
      .toFile(outPath);
  })
)
  .then(() => console.log('PNG assets generated successfully'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
