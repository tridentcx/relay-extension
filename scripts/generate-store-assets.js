const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const version = manifest.version;
const storeDir = path.join(root, 'store-assets');
const promoDir = path.join(storeDir, 'promotional');
const googleDir = path.join(storeDir, 'google-submission');
const tmpDir = path.join(storeDir, '.tmp');

for (const dir of [storeDir, promoDir, googleDir, tmpDir, path.join(root, 'icons')]) {
  fs.mkdirSync(dir, { recursive: true });
}

const chrome = findChrome();
const logoSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="96" y1="48" x2="432" y2="464" gradientUnits="userSpaceOnUse">
      <stop stop-color="#18A7A0"/>
      <stop offset="0.58" stop-color="#0C6E6E"/>
      <stop offset="1" stop-color="#083F44"/>
    </linearGradient>
    <filter id="shadow" x="24" y="24" width="464" height="464" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="22" stdDeviation="28" flood-color="#0C6E6E" flood-opacity="0.22"/>
    </filter>
  </defs>
  <rect x="56" y="56" width="400" height="400" rx="104" fill="url(#bg)" filter="url(#shadow)"/>
  <path d="M128 178H294L252 136H322L404 218L322 300H252L294 258H128V178Z" fill="#FFFDF8"/>
  <path d="M384 334H218L260 376H190L108 294L190 212H260L218 254H384V334Z" fill="#FFFDF8" fill-opacity="0.62"/>
</svg>
`;

fs.writeFileSync(path.join(root, 'icons', 'icon_source.svg'), logoSvg);
fs.writeFileSync(path.join(storeDir, 'relay-logo.svg'), logoSvg);

for (const size of [16, 48, 128]) {
  const png = renderIcon(size);
  fs.writeFileSync(path.join(root, 'icons', `icon${size}.png`), png);
}

const promos = [
  ['small-promo-440x280', promoSmall(), 440, 280],
  ['marquee-promo-1400x560', promoMarquee(), 1400, 560],
];

for (const [name, svg, width, height] of promos) {
  const svgPath = path.join(promoDir, `${name}.svg`);
  const pngPath = path.join(promoDir, `${name}.png`);
  fs.writeFileSync(svgPath, svg);
  renderSvg(svgPath, pngPath, width, height);
}

writeGoogleSubmissionSet();
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('Generated icons and privacy-first Google promotional images.');

function writeGoogleSubmissionSet() {
  fs.rmSync(googleDir, { recursive: true, force: true });
  fs.mkdirSync(googleDir, { recursive: true });

  const files = [
    ['store-icon-128.png', path.join(root, 'icons', 'icon128.png')],
    ['promo-small-440x280.png', path.join(promoDir, 'small-promo-440x280.png')],
    ['promo-marquee-1400x560.png', path.join(promoDir, 'marquee-promo-1400x560.png')],
  ];

  for (const [name, source] of files) {
    fs.copyFileSync(source, path.join(googleDir, name));
  }
}

function renderSvg(svgPath, outPath, width, height) {
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--window-size=${width},${height}`,
    `--screenshot=${outPath}`,
    `file://${svgPath}`,
  ], { stdio: 'ignore' });
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'google-chrome',
    'google-chrome-stable',
    'chromium-browser',
    'chromium',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // Try the next known browser path/name.
    }
  }
  throw new Error('Chrome or Chromium is required to render store asset PNG files. Set CHROME_BIN to the browser executable path.');
}

function renderIcon(size) {
  const scale = 4;
  const w = size * scale;
  const h = size * scale;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const nx = (x + 0.5) / w;
      const ny = (y + 0.5) / h;
      const idx = (y * w + x) * 4;
      const inBg = roundedRect(nx, ny, 0.07, 0.07, 0.86, 0.86, 0.21);
      if (!inBg) continue;
      const t = Math.min(1, Math.max(0, (nx + ny) / 2));
      const bg = mix([24, 167, 160], t < 0.58 ? [12, 110, 110] : [8, 63, 68], t < 0.58 ? t / 0.58 : (t - 0.58) / 0.42);
      let color = bg;
      let alpha = 255;
      if (poly(nx, ny, [[0.25,0.34],[0.57,0.34],[0.53,0.43],[0.21,0.43]]) || poly(nx, ny, [[0.53,0.25],[0.78,0.385],[0.53,0.52]])) {
        color = [255, 253, 248];
      } else if (poly(nx, ny, [[0.43,0.58],[0.75,0.58],[0.79,0.67],[0.47,0.67]]) || poly(nx, ny, [[0.47,0.49],[0.22,0.625],[0.47,0.76]])) {
        color = mix(bg, [255, 253, 248], 0.66);
      }
      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];
      rgba[idx + 3] = alpha;
    }
  }
  return encodePng(resample(rgba, w, h, size, size), size, size);
}

function roundedRect(x, y, rx, ry, rw, rh, r) {
  const cx = Math.max(rx + r, Math.min(x, rx + rw - r));
  const cy = Math.max(ry + r, Math.min(y, ry + rh - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
}

function poly(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0], yi = points[i][1];
    const xj = points[j][0], yj = points[j][1];
    const intersect = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function resample(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const sx = sw / dw;
  const sy = sh / dh;
  for (let y = 0; y < dh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      const acc = [0, 0, 0, 0];
      for (let yy = 0; yy < sy; yy += 1) {
        for (let xx = 0; xx < sx; xx += 1) {
          const idx = ((Math.floor(y * sy + yy) * sw) + Math.floor(x * sx + xx)) * 4;
          for (let c = 0; c < 4; c += 1) acc[c] += src[idx + c];
        }
      }
      const count = sx * sy;
      const outIdx = (y * dw + x) * 4;
      for (let c = 0; c < 4; c += 1) out[outIdx + c] = Math.round(acc[c] / count);
    }
  }
  return out;
}

function encodePng(rgba, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const chunks = [
    chunk('IHDR', Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ];
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), ...chunks]);
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  return Buffer.concat([u32(data.length), name, data, u32(crc32(Buffer.concat([name, data])))]); 
}

function crc32(buf) {
  let crc = -1;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function miniLogo(x, y, s) {
  return `<g transform="translate(${x} ${y}) scale(${s / 512})">
    <rect x="56" y="56" width="400" height="400" rx="104" fill="url(#brand)"/>
    <path d="M128 178H294L252 136H322L404 218L322 300H252L294 258H128V178Z" fill="#FFFDF8"/>
    <path d="M384 334H218L260 376H190L108 294L190 212H260L218 254H384V334Z" fill="#FFFDF8" fill-opacity=".62"/>
  </g>`;
}

function promoSmall() {
  return `<svg width="440" height="280" viewBox="0 0 440 280" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="brand" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#18A7A0"/><stop offset=".58" stop-color="#0C6E6E"/><stop offset="1" stop-color="#083F44"/></linearGradient></defs>
    <rect width="440" height="280" fill="#FBF7EF"/>
    ${miniLogo(34, 42, 70)}
    <text x="34" y="154" font-family="Avenir Next, Arial" font-size="38" font-weight="850" fill="#242019">Relay</text>
    <text x="34" y="188" font-family="Avenir Next, Arial" font-size="18" fill="#6F6659">Private bookmark sync</text>
    <text x="34" y="220" font-family="Avenir Next, Arial" font-size="15" fill="#0C6E6E">No email. No tracking.</text>
    <rect x="280" y="48" width="116" height="168" rx="18" fill="#FFFDF8" stroke="#D8CFC0"/>
    <circle cx="338" cy="104" r="28" fill="#E9F4F1"/>
    <path d="M324 100h22l-7-7h13l15 15-15 15h-13l7-7h-22z" fill="#0C6E6E"/>
    <text x="338" y="154" text-anchor="middle" font-family="Avenir Next, Arial" font-size="17" font-weight="850" fill="#242019">Sync</text>
    <text x="338" y="178" text-anchor="middle" font-family="Avenir Next, Arial" font-size="11" fill="#6F6659">Encrypted</text>
  </svg>`;
}

function promoMarquee() {
  return `<svg width="1400" height="560" viewBox="0 0 1400 560" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="brand" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#18A7A0"/><stop offset=".58" stop-color="#0C6E6E"/><stop offset="1" stop-color="#083F44"/></linearGradient></defs>
    <rect width="1400" height="560" fill="#FBF7EF"/>
    ${miniLogo(96, 104, 108)}
    <text x="96" y="282" font-family="Avenir Next, Arial" font-size="68" font-weight="800" fill="#242019">Relay</text>
    <text x="96" y="336" font-family="Avenir Next, Arial" font-size="28" fill="#6F6659">Your bookmarks. Always in reach.</text>
    <text x="96" y="388" font-family="Avenir Next, Arial" font-size="22" fill="#0C6E6E">No email. No tracking. No readable cloud vault.</text>
    <rect x="844" y="72" width="390" height="416" rx="28" fill="#FFFDF8" stroke="#D8CFC0"/>
    <rect x="876" y="106" width="326" height="76" rx="18" fill="#0C6E6E"/>
    <text x="904" y="140" font-family="Avenir Next, Arial" font-size="20" font-weight="850" fill="#FFFDF8">Relay Pro</text>
    <text x="904" y="164" font-family="Avenir Next, Arial" font-size="13" fill="#D4F3EF">Auto-sync · restore history</text>
    <circle cx="1039" cy="262" r="58" fill="#E9F4F1"/>
    <circle cx="1039" cy="262" r="42" fill="#0C6E6E"/>
    <path d="M1017 256h38l-12-12h21l25 25-25 25h-21l12-12h-38z" fill="#FFFDF8"/>
    <text x="1039" y="364" text-anchor="middle" font-family="Avenir Next, Arial" font-size="30" font-weight="850" fill="#242019">Sync</text>
    <text x="1039" y="402" text-anchor="middle" font-family="Avenir Next, Arial" font-size="17" fill="#6F6659">1,248 bookmarks encrypted</text>
  </svg>`;
}
