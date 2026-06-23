import { inflate } from 'pako';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToUint8Array(base64: string): Uint8Array {
  // Strip data URI prefix if present
  const cleaned = base64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');

  // Build lookup table
  const lookup = new Uint8Array(256);
  for (let i = 0; i < BASE64_CHARS.length; i++) {
    lookup[BASE64_CHARS.charCodeAt(i)] = i;
  }

  const len = cleaned.length;
  // Count padding
  let padding = 0;
  if (len > 0 && cleaned[len - 1] === '=') padding++;
  if (len > 1 && cleaned[len - 2] === '=') padding++;

  const outputLen = (len * 3) / 4 - padding;
  const output = new Uint8Array(outputLen);

  let pos = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[cleaned.charCodeAt(i)];
    const b = lookup[cleaned.charCodeAt(i + 1)];
    const c = lookup[cleaned.charCodeAt(i + 2)];
    const d = lookup[cleaned.charCodeAt(i + 3)];

    output[pos++] = (a << 2) | (b >> 4);
    if (pos < outputLen) output[pos++] = ((b & 0xf) << 4) | (c >> 2);
    if (pos < outputLen) output[pos++] = ((c & 0x3) << 6) | d;
  }

  return output;
}

function readUint32BE(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] & 0xff) << 24) |
    ((data[offset + 1] & 0xff) << 16) |
    ((data[offset + 2] & 0xff) << 8) |
    (data[offset + 3] & 0xff)
  ) >>> 0;
}

function chunkType(data: Uint8Array, offset: number): string {
  return String.fromCharCode(
    data[offset],
    data[offset + 1],
    data[offset + 2],
    data[offset + 3]
  );
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function extractAllPixelsFromPng(
  base64: string,
  width: number,
  height: number
): [number, number, number][][] {
  try {
    const bytes = base64ToUint8Array(base64);
    if (bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) return [];

    let offset = 8;
    let colorType = 2;
    const idatChunks: Uint8Array[] = [];

    while (offset + 12 <= bytes.length) {
      const length = readUint32BE(bytes, offset);
      const type = chunkType(bytes, offset + 4);
      const dataStart = offset + 8;
      if (type === 'IHDR') {
        colorType = bytes[dataStart + 9];
      } else if (type === 'IDAT') {
        idatChunks.push(bytes.slice(dataStart, dataStart + length));
      } else if (type === 'IEND') {
        break;
      }
      offset += 12 + length;
    }

    if (!idatChunks.length) return [];

    let totalLen = 0;
    for (const c of idatChunks) totalLen += c.length;
    const combined = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of idatChunks) { combined.set(c, pos); pos += c.length; }

    const inflated = inflate(combined);
    const bpp = colorType === 6 ? 4 : colorType === 0 ? 1 : 3;
    const stride = 1 + width * bpp;
    const pixels: [number, number, number][][] = [];

    for (let y = 0; y < height; y++) {
      const rowStart = y * stride;
      const filter = inflated[rowStart];
      const row: [number, number, number][] = [];

      for (let x = 0; x < width; x++) {
        const p = rowStart + 1 + x * bpp;
        let r = inflated[p] ?? 0;
        let g = bpp > 1 ? (inflated[p + 1] ?? 0) : r;
        let b = bpp > 2 ? (inflated[p + 2] ?? 0) : r;

        const left: [number, number, number] = x > 0 ? row[x - 1] : [0, 0, 0];
        const above: [number, number, number] = y > 0 ? pixels[y - 1][x] : [0, 0, 0];
        const aboveLeft: [number, number, number] = x > 0 && y > 0 ? pixels[y - 1][x - 1] : [0, 0, 0];

        if (filter === 1) {
          r = (r + left[0]) & 0xff; g = (g + left[1]) & 0xff; b = (b + left[2]) & 0xff;
        } else if (filter === 2) {
          r = (r + above[0]) & 0xff; g = (g + above[1]) & 0xff; b = (b + above[2]) & 0xff;
        } else if (filter === 3) {
          r = (r + Math.floor((left[0] + above[0]) / 2)) & 0xff;
          g = (g + Math.floor((left[1] + above[1]) / 2)) & 0xff;
          b = (b + Math.floor((left[2] + above[2]) / 2)) & 0xff;
        } else if (filter === 4) {
          r = (r + paeth(left[0], above[0], aboveLeft[0])) & 0xff;
          g = (g + paeth(left[1], above[1], aboveLeft[1])) & 0xff;
          b = (b + paeth(left[2], above[2], aboveLeft[2])) & 0xff;
        }

        row.push([r, g, b]);
      }
      pixels.push(row);
    }

    return pixels;
  } catch {
    return [];
  }
}

export function extractPixelFromPng(base64: string): [number, number, number] {
  try {
    const bytes = base64ToUint8Array(base64);

    // Verify PNG signature: 137 80 78 71 13 10 26 10
    if (
      bytes[0] !== 137 ||
      bytes[1] !== 80 ||
      bytes[2] !== 78 ||
      bytes[3] !== 71
    ) {
      return [128, 128, 128];
    }

    let offset = 8; // Skip 8-byte signature
    let colorType = 2; // Default RGB
    let bitDepth = 8;
    const idatChunks: Uint8Array[] = [];

    while (offset + 12 <= bytes.length) {
      const length = readUint32BE(bytes, offset);
      const type = chunkType(bytes, offset + 4);
      const dataStart = offset + 8;

      if (type === 'IHDR') {
        // Width: bytes 0-3, Height: bytes 4-7, BitDepth: byte 8, ColorType: byte 9
        bitDepth = bytes[dataStart + 8];
        colorType = bytes[dataStart + 9];
      } else if (type === 'IDAT') {
        idatChunks.push(bytes.slice(dataStart, dataStart + length));
      } else if (type === 'IEND') {
        break;
      }

      offset += 12 + length; // length + type(4) + data + crc(4)
    }

    if (idatChunks.length === 0) return [128, 128, 128];

    // Concatenate all IDAT chunks
    let totalLen = 0;
    for (const chunk of idatChunks) totalLen += chunk.length;
    const combined = new Uint8Array(totalLen);
    let pos = 0;
    for (const chunk of idatChunks) {
      combined.set(chunk, pos);
      pos += chunk.length;
    }

    // Inflate (decompress)
    const inflated = inflate(combined);

    // For a 1x1 image, first byte is filter type, then pixel data
    // filter byte at index 0
    if (inflated.length < 2) return [128, 128, 128];

    // colorType 2 = RGB (3 bytes per pixel)
    // colorType 6 = RGBA (4 bytes per pixel)
    // colorType 0 = Grayscale (1 byte per pixel)
    if (colorType === 2) {
      // RGB
      const r = inflated[1];
      const g = inflated[2];
      const b = inflated[3];
      return [r, g, b];
    } else if (colorType === 6) {
      // RGBA
      const r = inflated[1];
      const g = inflated[2];
      const b = inflated[3];
      // ignore alpha at inflated[4]
      return [r, g, b];
    } else if (colorType === 0) {
      // Grayscale
      const v = inflated[1];
      return [v, v, v];
    }

    return [128, 128, 128];
  } catch {
    return [128, 128, 128];
  }
}
