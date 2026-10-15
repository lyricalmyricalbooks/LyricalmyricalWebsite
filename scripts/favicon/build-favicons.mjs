// Redraws the shop's built-in tab and home-screen icons in public/ from the SVGs next to this file.
// Run by hand after editing a drawing: `node scripts/favicon/build-favicons.mjs` (needs Chromium; set
// CHROMIUM_PATH to reuse an installed one). Not part of the build: the PNG/ICO files are committed.
//   favicon-16.svg  pixel-fitted for 16px tabs (plain screens)
//   favicon.svg     the lyre and swirl for 32px and up (sharp screens)
//   app-icon.svg    full-bleed with a safe margin, for phone home screens (iOS and Android crop it)
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../public');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function png(svgName, size) {
  const svg = await readFile(resolve(here, svgName));
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img width="${size}" height="${size}" style="display:block" src="data:image/svg+xml;base64,${svg.toString('base64')}">`);
  await page.waitForFunction(() => document.images[0]?.complete);
  const buf = await page.screenshot({ omitBackground: true });
  await page.close();
  return buf;
}

/** An .ico holding PNG images (supported by every browser that still asks for /favicon.ico). */
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, at); head.writeUInt8(size >= 256 ? 0 : size, at + 1);
    head.writeUInt16LE(1, at + 4); head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(data.length, at + 8); head.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map(i => i.data)]);
}

const small = await png('favicon-16.svg', 16);
const i32 = await png('favicon.svg', 32);
const i48 = await png('favicon.svg', 48);
await writeFile(resolve(out, 'favicon-16.png'), small);
await writeFile(resolve(out, 'favicon-32.png'), i32);
await writeFile(resolve(out, 'favicon.ico'), ico([{ size: 16, data: small }, { size: 32, data: i32 }, { size: 48, data: i48 }]));
await writeFile(resolve(out, 'apple-touch-icon.png'), await png('app-icon.svg', 180));
await writeFile(resolve(out, 'icon-192.png'), await png('app-icon.svg', 192));
await writeFile(resolve(out, 'icon-512.png'), await png('app-icon.svg', 512));
await browser.close();
console.log('Icons written to public/.');
