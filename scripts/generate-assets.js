/**
 * Generates placeholder PNG images for the Cat Gatekeeper app.
 * No external dependencies — uses pure Node.js.
 * Run via: node scripts/generate-assets.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ASSETS_DIR = path.join(__dirname, '..', 'src', 'assets');

// ---------------------------------------------------------------------------
// Minimal PNG generator (RGBA)
// ---------------------------------------------------------------------------
function createPNG(width, height, getPixel) {
  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);   // bit depth
  ihdrData.writeUInt8(6, 9);   // color type: RGBA
  ihdrData.writeUInt8(0, 10);  // compression
  ihdrData.writeUInt8(0, 11);  // filter
  ihdrData.writeUInt8(0, 12);  // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT chunk - raw pixel data with filter byte per row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawData[rowOffset] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }
  const compressed = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressed);

  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuf, data]);
  const crc = crc32(crcData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// CRC-32 implementation
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ---------------------------------------------------------------------------
// Cat face pixel art (simple)
// ---------------------------------------------------------------------------
function catPixelArt(x, y, w, h) {
  // Orange tabby cat face on transparent background
  const cx = w / 2, cy = h / 2;
  const dx = x - cx, dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const faceRadius = Math.min(w, h) * 0.4;

  // Ear positions
  const earL = { x: cx - faceRadius * 0.6, y: cy - faceRadius * 0.65 };
  const earR = { x: cx + faceRadius * 0.6, y: cy - faceRadius * 0.65 };
  const earSize = faceRadius * 0.35;

  // Eye positions
  const eyeY = cy - faceRadius * 0.15;
  const eyeSpacing = faceRadius * 0.3;

  // Check if point is in triangle (ears)
  function inTriangle(px, py, ax, ay, bx, by, cx2, cy2) {
    const d1 = sign(px, py, ax, ay, bx, by);
    const d2 = sign(px, py, bx, by, cx2, cy2);
    const d3 = sign(px, py, cx2, cy2, ax, ay);
    const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(neg && pos);
  }
  function sign(px, py, x1, y1, x2, y2) {
    return (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  }

  // Orange tabby colors
  const fur = { r: 243, g: 156, b: 18 };
  const darkFur = { r: 200, g: 120, b: 10 };
  const innerEar = { r: 255, g: 192, b: 203 };
  const eyeColor = { r: 46, g: 204, b: 113 };
  const nose = { r: 231, g: 76, b: 60 };
  const white = { r: 255, g: 255, b: 255 };
  const transparent = { r: 0, g: 0, b: 0, a: 0 };

  // Background - transparent
  if (dist > faceRadius * 1.1) return transparent;

  // Ears
  if (inTriangle(x, y,
    earL.x - earSize * 0.7, earL.y - earSize,
    earL.x + earSize * 0.7, earL.y - earSize,
    earL.x, earL.y + earSize * 0.5
  )) return { ...fur };

  if (inTriangle(x, y,
    earR.x - earSize * 0.7, earR.y - earSize,
    earR.x + earSize * 0.7, earR.y - earSize,
    earR.x, earR.y + earSize * 0.5
  )) return { ...fur };

  // Face circle
  if (dist > faceRadius * 0.9) return { ...(dist > faceRadius * 0.95 ? darkFur : fur) };

  // Eyes
  const eyeDist = Math.abs(Math.abs(x - cx) - eyeSpacing);
  if (Math.abs(y - eyeY) < faceRadius * 0.08 && eyeDist < faceRadius * 0.12) {
    return { ...white };
  }
  if (Math.abs(y - eyeY) < faceRadius * 0.04 && eyeDist < faceRadius * 0.06) {
    return { ...eyeColor };
  }
  // Pupils
  if (Math.abs(y - eyeY) < faceRadius * 0.06 && eyeDist < faceRadius * 0.03) {
    return { r: 0, g: 0, b: 0 };
  }

  // Nose
  if (Math.abs(x - cx) < faceRadius * 0.04 && Math.abs(y - (cy + faceRadius * 0.05)) < faceRadius * 0.03) {
    return { ...nose };
  }

  // Mouth
  if (Math.abs(y - (cy + faceRadius * 0.13)) < 2 && Math.abs(x - cx) < faceRadius * 0.06) {
    return { r: 60, g: 40, b: 20 };
  }

  // Whiskers
  const whiskerY = cy + faceRadius * 0.08;
  if (Math.abs(y - whiskerY) < 1) {
    if ((x > cx + faceRadius * 0.15 && x < cx + faceRadius * 0.5) ||
      (x < cx - faceRadius * 0.15 && x > cx - faceRadius * 0.5)) {
      return { r: 60, g: 40, b: 20, a: 150 };
    }
  }

  // Stripes on forehead (tabby M pattern)
  if (y < cy - faceRadius * 0.2 && y > cy - faceRadius * 0.45 && dist < faceRadius * 0.7) {
    if (Math.abs(x - cx) < faceRadius * 0.05 && Math.abs(y - (cy - faceRadius * 0.35)) < faceRadius * 0.08) {
      return { ...darkFur };
    }
  }

  return { ...fur };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  console.log('Generating assets...');

  // App icon (64x64 cat face)
  const icon = createPNG(64, 64, (x, y) => {
    const p = catPixelArt(x, y, 64, 64);
    return [p.r, p.g, p.b, p.a !== undefined ? p.a : 255];
  });
  fs.writeFileSync(path.join(ASSETS_DIR, 'icon.png'), icon);
  console.log('  [OK] icon.png (64x64)');

  // Tray icon (32x32 cat face)  
  const trayIcon = createPNG(32, 32, (x, y) => {
    const p = catPixelArt(x, y, 32, 32);
    return [p.r, p.g, p.b, p.a !== undefined ? p.a : 255];
  });
  fs.writeFileSync(path.join(ASSETS_DIR, 'icon-small.png'), trayIcon);
  console.log('  [OK] icon-small.png (32x32)');

  // Fallback cat image (800x600) - larger cat face
  const catImg = createPNG(800, 600, (x, y, w, h) => {
    const p = catPixelArt(x, y, w, h);
    return [p.r, p.g, p.b, p.a !== undefined ? p.a : 255];
  });
  fs.writeFileSync(path.join(ASSETS_DIR, 'cat.png'), catImg);
  console.log('  [OK] cat.png (800x600)');

  console.log('\nAll assets generated!');
}

main();
