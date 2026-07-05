// Generates assets/calibration-card.pdf — a printable A4 calibration card
// for the white-card calibrate flow (CD-6). Hand-built PDF, no deps:
// standard Helvetica only, flat colour rectangles, valid xref table.
//
//   node scripts/gen-calibration-card.mjs
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'calibration-card.pdf');

// A4 portrait in points.
const W = 595;
const H = 842;

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const rgb = (hex) => hexToRgb(hex).map((c) => c.toFixed(4)).join(' ');

const PATCHES = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Grey', hex: '#808080' },
  { name: 'Red', hex: '#C62828' },
  { name: 'Green', hex: '#2E7D32' },
  { name: 'Blue', hex: '#1565C0' },
  { name: 'Yellow', hex: '#F9A825' },
];

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const text = (x, y, size, str, bold = false) =>
  `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${esc(str)}) Tj ET\n`;
const rect = (x, y, w, h, fillHex, stroke = false) =>
  `${rgb(fillHex)} rg ${stroke ? '0.6 0.6 0.6 RG 0.75 w ' : ''}${x} ${y} ${w} ${h} re ${stroke ? 'B' : 'f'}\n`;

let c = '';

// Header
c += text(60, H - 70, 22, 'Colour Detective - Calibration Card', true);
c += text(60, H - 92, 11, 'Print on plain white paper at 100% scale (no "fit to page").');

// The big white reference panel: generous so it fills the camera crosshair.
const panelY = H - 400;
c += rect(60, panelY, 475, 260, '#FFFFFF', true);
c += text(70, panelY + 236, 13, '1. White reference', true);
c += text(70, panelY + 216, 11, 'Hold this white area so it fills the crosshair, in the same light');
c += text(70, panelY + 200, 11, 'as the wall you want to scan.');
c += text(70, panelY + 184, 11, '2. In the app, tap the white-card button, then "Lock white".');
c += text(70, panelY + 168, 11, '3. Point back at your wall - readings are now corrected for the');
c += text(70, panelY + 152, 11, '   room lighting.');

// Grey + known-colour check patches.
const rowY = panelY - 130;
c += text(60, rowY + 96, 13, 'Check patches', true);
c += text(60, rowY + 78, 10, 'After locking white, scan each patch - the app should read close to the printed value.');

const pw = 70;
const gap = 11;
PATCHES.forEach((p, i) => {
  const x = 60 + i * (pw + gap);
  c += rect(x, rowY, pw, 62, p.hex, true);
  c += text(x, rowY - 14, 9, p.name, true);
  c += text(x, rowY - 26, 8, p.hex);
});

// Footer notes.
c += text(60, rowY - 60, 10, 'Tip: printed colours vary between printers - the white and grey areas matter most.');
c += text(60, rowY - 75, 10, 'Keep the card flat and avoid shadows or glare while calibrating.');

// --- Assemble the PDF ---
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
  `<< /Length ${Buffer.byteLength(c)} >>\nstream\n${c}endstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
];

let pdf = '%PDF-1.4\n';
const offsets = [];
objects.forEach((body, i) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xrefAt = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, pdf, 'binary');
console.log('wrote', OUT, Buffer.byteLength(pdf), 'bytes');
