// The look book's planet photos (REPORT.md): fetches each from Wikimedia
// Commons, checks that it is public domain, crops it to the planet's disc
// in headless Chromium, and writes the crops into look-book.html. Saturn
// keeps its rings: its crop spans SATURN_SPAN globe radii, with space made
// transparent. Contacts commons.wikimedia.org and upload.wikimedia.org.
//   node research/appearance/photos.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PAGE = new URL('./look-book.html', import.meta.url);
const UA = 'roslambo-look-book/1.0 (research script, one-off download)';
const SATURN_SPAN = 2.5; // as in look-book.html

// Planet k is the k-th from the Sun. Each disc is measured in the 960-pixel
// rendition (Jupiter's original is 940 pixels, so it comes at that size):
// centre and radius in pixels, from the bright pixels' bounding box,
// allowing for a shadowed limb.
const PHOTOS = [
  ['mercury', 'Mercury in true color.jpg', 476, 478.5, 442], // MESSENGER
  ['venus', 'Venus from Mariner 10.jpg', 495, 480, 451],
  ['earth', 'The Earth seen from Apollo 17.jpg', 477, 482, 463],
  ['mars', 'Mars Valles Marineris.jpeg', 480, 477, 478], // Viking
  ['jupiter', 'Jupiter and its shrunken Great Red Spot.jpg', 470, 468, 434], // Hubble
  ['saturn', 'Saturn during Equinox.jpg', 479, 240.5, 167], // Cassini
  ['uranus', 'Uranus as seen by NASA\'s Voyager 2 (remastered) - JPEG converted.jpg', 474.5, 478, 391],
  ['neptune', 'Neptune Full.jpg', 479, 481, 414], // Voyager 2
];

/** In the page: the disc as a square image the renderer clips to a circle,
 *  or for Saturn a wider square with the space around it transparent. */
async function crop({ src, cx, cy, rad, saturn, span }) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const half = saturn ? rad * span : rad;
  const size = saturn ? 320 : 192;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, cx - half, cy - half, 2 * half, 2 * half, 0, 0, size, size);
  if (!saturn) return c.toDataURL('image/jpeg', 0.86);
  const d = x.getImageData(0, 0, size, size);
  const p = d.data, g = size / 2, globe = size / (2 * span);
  for (let i = 0; i < p.length; i += 4) {
    const k = i / 4, px = k % size, py = Math.floor(k / size);
    const L = (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;
    p[i + 3] = Math.hypot(px + 0.5 - g, py + 0.5 - g) < globe - 0.5 ? 255 : Math.round(255 * Math.min(1, Math.max(0, (L - 0.05) / 0.25)));
  }
  x.putImageData(d, 0, 0);
  return c.toDataURL('image/webp', 0.9);
}

const api = new URL('https://commons.wikimedia.org/w/api.php');
api.search = new URLSearchParams({
  action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '960',
  titles: PHOTOS.map(([, file]) => `File:${file}`).join('|'),
}).toString();
const meta = await (await fetch(api, { headers: { 'User-Agent': UA } })).json();
const info = new Map(Object.values(meta.query.pages).map((p) => [p.title.slice('File:'.length), p.imageinfo?.[0]]));

const browser = await chromium.launch();
const page = await browser.newPage();
const out = {};
for (const [name, file, cx, cy, rad] of PHOTOS) {
  const ii = info.get(file);
  const licence = ii?.extmetadata?.LicenseShortName?.value;
  if (licence !== 'Public domain') throw new Error(`${file}: the licence is ${licence ?? 'unknown'}, not public domain`);
  const res = await fetch(ii.thumburl, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const src = `data:image/jpeg;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  out[name] = await page.evaluate(crop, { src, cx, cy, rad, saturn: name === 'saturn', span: SATURN_SPAN });
  console.log(`${name}: ${file}, ${Math.round(out[name].length / 1024)} KB`);
}
await browser.close();

const re = /(<script type="application\/json" id="photos">)[\s\S]*?(<\/script>)/;
const html = readFileSync(PAGE, 'utf8');
if (!re.test(html)) throw new Error('look-book.html has no photos block');
writeFileSync(PAGE, html.replace(re, (_, open, close) => open + JSON.stringify(out) + close));
