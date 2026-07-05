"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..");
const ICON_DIR = path.join(ROOT, "icons");
const SIZES = [16, 19, 32, 38, 48, 128];
const PAGE_ACTION_SIZES = [19, 38];
const SAMPLE = 4;

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return out;
}

function encodePng(width, height, pixels) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = y * width * 4;
    const targetStart = y * (width * 4 + 1);
    pixels.copy(scanlines, targetStart + 1, sourceStart, sourceStart + width * 4);
  }

  return Buffer.concat([
    header,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function blendPixel(pixels, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= width) {
    return;
  }

  const offset = (y * width + x) * 4;
  const sourceAlpha = color[3] / 255;
  const targetAlpha = pixels[offset + 3] / 255;
  const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);

  if (outputAlpha === 0) {
    return;
  }

  for (let channel = 0; channel < 3; channel += 1) {
    pixels[offset + channel] = Math.round(
      (color[channel] * sourceAlpha + pixels[offset + channel] * targetAlpha * (1 - sourceAlpha)) /
        outputAlpha
    );
  }

  pixels[offset + 3] = Math.round(outputAlpha * 255);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

function drawShape(pixels, width, matcher, color) {
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const bx = ((x + 0.5) / width) * 128;
      const by = ((y + 0.5) / width) * 128;
      if (matcher(bx, by)) {
        blendPixel(pixels, width, x, y, color);
      }
    }
  }
}

function drawRoundedRect(pixels, width) {
  drawShape(
    pixels,
    width,
    (x, y) => {
      const inset = 2;
      const radius = 20;
      const min = inset;
      const max = 128 - inset;
      const dx = x < min + radius ? min + radius - x : x > max - radius ? x - (max - radius) : 0;
      const dy = y < min + radius ? min + radius - y : y > max - radius ? y - (max - radius) : 0;
      if (x < min || y < min || x > max || y > max) {
        return false;
      }
      return dx * dx + dy * dy <= radius * radius;
    },
    [22, 24, 28, 255]
  );
}

function drawLine(pixels, width, points, lineWidth, color) {
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    drawShape(pixels, width, (x, y) => distanceToSegment(x, y, ax, ay, bx, by) <= lineWidth / 2, color);
  }
  for (const [cx, cy] of points) {
    drawShape(pixels, width, (x, y) => Math.hypot(x - cx, y - cy) <= lineWidth / 2, color);
  }
}

function drawIcon(size) {
  const highSize = size * SAMPLE;
  const highPixels = Buffer.alloc(highSize * highSize * 4);
  drawRoundedRect(highPixels, highSize);
  drawCircleStroke(highPixels, highSize, 64, 62, 40, 11, [255, 255, 255, 255]);
  drawLine(highPixels, highSize, [[64, 62], [64, 35]], 11, [255, 255, 255, 255]);
  drawLine(highPixels, highSize, [[64, 62], [42, 84]], 11, [255, 255, 255, 255]);
  drawShape(highPixels, highSize, (x, y) => Math.hypot(x - 64, y - 62) <= 7, [255, 255, 255, 255]);
  drawLine(highPixels, highSize, [[84, 98], [107, 75]], 14, [255, 255, 255, 255]);
  drawLine(highPixels, highSize, [[84, 98], [107, 75]], 8, [255, 79, 100, 255]);

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let sy = 0; sy < SAMPLE; sy += 1) {
        for (let sx = 0; sx < SAMPLE; sx += 1) {
          const offset = ((y * SAMPLE + sy) * highSize + x * SAMPLE + sx) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            totals[channel] += highPixels[offset + channel];
          }
        }
      }
      const target = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[target + channel] = Math.round(totals[channel] / (SAMPLE * SAMPLE));
      }
    }
  }

  fs.writeFileSync(path.join(ICON_DIR, `icon-${size}.png`), encodePng(size, size, pixels));
}

function drawCircleStroke(pixels, width, centerX, centerY, radius, lineWidth, color) {
  drawShape(
    pixels,
    width,
    (x, y) => {
      const distance = Math.hypot(x - centerX, y - centerY);
      return distance >= radius - lineWidth / 2 && distance <= radius + lineWidth / 2;
    },
    color
  );
}

function drawPageActionIcon(size, enabled) {
  const highSize = size * SAMPLE;
  const highPixels = Buffer.alloc(highSize * highSize * 4);
  const color = enabled ? [0, 96, 223, 255] : [215, 0, 34, 255];

  drawCircleStroke(highPixels, highSize, 64, 64, 44, 12, color);
  drawLine(highPixels, highSize, [[64, 64], [64, 36]], 11, color);
  drawLine(highPixels, highSize, [[64, 64], [88, 76]], 11, color);
  drawShape(highPixels, highSize, (x, y) => Math.hypot(x - 64, y - 64) <= 7, color);

  if (!enabled) {
    drawLine(highPixels, highSize, [[24, 104], [104, 24]], 20, [255, 255, 255, 255]);
    drawLine(highPixels, highSize, [[24, 104], [104, 24]], 11, color);
  }

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let sy = 0; sy < SAMPLE; sy += 1) {
        for (let sx = 0; sx < SAMPLE; sx += 1) {
          const offset = ((y * SAMPLE + sy) * highSize + x * SAMPLE + sx) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            totals[channel] += highPixels[offset + channel];
          }
        }
      }
      const target = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[target + channel] = Math.round(totals[channel] / (SAMPLE * SAMPLE));
      }
    }
  }

  const state = enabled ? "on" : "off";
  fs.writeFileSync(path.join(ICON_DIR, `page-${state}-${size}.png`), encodePng(size, size, pixels));
}

for (const size of SIZES) {
  drawIcon(size);
}

for (const size of PAGE_ACTION_SIZES) {
  drawPageActionIcon(size, true);
  drawPageActionIcon(size, false);
}
