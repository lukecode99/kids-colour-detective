import { Platform } from 'react-native';
import { extractAllPixelsFromPng } from './pngPixel';
import { medianRgb, sampleWindowOrigin, Rgb } from './photoSample';

let ImageManipulator: any = null;
if (Platform.OS !== 'web') {
  ImageManipulator = require('expo-image-manipulator');
}

const SAMPLE_SIZE = 9; // 9×9 median window around the tap point

function loadHtmlImage(uri: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const img = new (globalThis as any).Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = uri;
  });
}

// Median colour of a small window centred on image pixel (x, y). The median
// makes the reading deterministic and robust to speckle, so repeated taps on
// the same spot always return the same colour.
export async function sampleMedianAt(
  uri: string,
  imgW: number,
  imgH: number,
  x: number,
  y: number
): Promise<Rgb> {
  const { ox, oy, w, h } = sampleWindowOrigin(x, y, imgW, imgH, SAMPLE_SIZE);

  if (Platform.OS === 'web') {
    const img = await loadHtmlImage(uri);
    // Picker-reported dimensions can differ from the decoded bitmap.
    const sx = (img.naturalWidth || imgW) / imgW;
    const sy = (img.naturalHeight || imgH) / imgH;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, ox * sx, oy * sy, w * sx, h * sy, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const pixels: Rgb[] = [];
    for (let i = 0; i < data.length; i += 4) {
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
    return medianRgb(pixels);
  }

  const crop = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: { originX: ox, originY: oy, width: w, height: h } }],
    { format: ImageManipulator.SaveFormat.PNG, base64: true }
  );
  if (!crop.base64) throw new Error('crop failed');
  const grid = extractAllPixelsFromPng(crop.base64, w, h);
  return medianRgb(grid.flat() as Rgb[]);
}
