import { rgbToHsl, rgbToHex } from './colorMath';

export interface ColorInfo {
  name: string;
  hex: string;
  emoji: string;
}

function getSimpleName(h: number, s: number, l: number, r: number, g: number, b: number): { name: string; emoji: string } {
  // Achromatic checks
  if (l > 0.92) return { name: 'White', emoji: '⚪' };
  if (l < 0.09) return { name: 'Black', emoji: '⚫' };
  if (s < 0.15) return { name: 'Grey', emoji: '🩶' };

  // Brown: hue 20-40, low lightness, decent saturation
  if (h >= 20 && h < 40 && l < 0.38 && s > 0.3) return { name: 'Brown', emoji: '🟤' };

  // Hue-based
  // Red zone: if very light (L>0.70), treat as Pink in simple mode
  if ((h >= 345 || h < 15) && l > 0.70) return { name: 'Pink', emoji: '🩷' };
  if (h >= 345 || h < 15) return { name: 'Red', emoji: '🔴' };
  if (h >= 15 && h < 25) return { name: 'Orange', emoji: '🟠' }; // Red-Orange → Orange
  if (h >= 25 && h < 45) return { name: 'Orange', emoji: '🟠' };
  if (h >= 45 && h < 70) return { name: 'Yellow', emoji: '🟡' };
  if (h >= 70 && h < 90) return { name: 'Green', emoji: '🟢' }; // Lime → Green
  if (h >= 90 && h < 160) return { name: 'Green', emoji: '🟢' };
  if (h >= 160 && h < 200) return { name: 'Blue', emoji: '🔵' }; // Teal/Cyan → Blue
  if (h >= 200 && h < 260) return { name: 'Blue', emoji: '🔵' };
  if (h >= 260 && h < 280) return { name: 'Purple', emoji: '🟣' }; // Indigo → Purple
  if (h >= 280 && h < 310) return { name: 'Purple', emoji: '🟣' };
  if (h >= 310 && h < 345) return { name: 'Pink', emoji: '🩷' };

  return { name: 'Grey', emoji: '🩶' };
}

function getComplexName(h: number, s: number, l: number, r: number, g: number, b: number): { name: string; emoji: string } {
  // White zone
  if (l > 0.92) {
    // Slight yellow tint
    if (r > g && r > b && g > b) return { name: 'Ivory', emoji: '⚪' };
    // Slight blue tint
    if (b > r && b > g) return { name: 'Pearl', emoji: '⚪' };
    return { name: 'White', emoji: '⚪' };
  }

  // Black zone
  if (l < 0.09) {
    if (l > 0.05) return { name: 'Charcoal', emoji: '⚫' };
    return { name: 'Onyx', emoji: '⚫' };
  }

  // Grey zone
  if (s < 0.15) {
    if (l > 0.65) return { name: 'Silver', emoji: '🩶' };
    if (l < 0.40 && s > 0.05) return { name: 'Slate', emoji: '🩶' };
    return { name: 'Ash', emoji: '🩶' };
  }

  // Brown: hue 20-40, low lightness, decent saturation
  if (h >= 20 && h < 40 && l < 0.38 && s > 0.3) {
    if (l < 0.20) return { name: 'Chocolate', emoji: '🟤' };
    if (h < 30) return { name: 'Mahogany', emoji: '🟤' };
    if (l > 0.50) return { name: 'Caramel', emoji: '🟤' };
    return { name: 'Tan', emoji: '🟤' };
  }

  // Red zone H 345-360 or 0-25
  if (h >= 345 || h < 25) {
    // Very light reds (pastel pink range) are Blush
    if (l > 0.80) return { name: 'Blush', emoji: '🩷' };
    if (l < 0.35) return { name: 'Crimson', emoji: '🔴' };
    if (s > 0.8) return { name: 'Scarlet', emoji: '🔴' };
    if (l > 0.65) return { name: 'Coral', emoji: '🔴' };
    return { name: 'Rose', emoji: '🔴' };
  }

  // Orange H 25-45
  if (h >= 25 && h < 45) {
    if (l < 0.45) return { name: 'Amber', emoji: '🟠' };
    if (l > 0.68) return { name: 'Peach', emoji: '🟠' };
    return { name: 'Tangerine', emoji: '🟠' };
  }

  // Yellow H 45-70
  if (h >= 45 && h < 70) {
    if (l < 0.55) return { name: 'Gold', emoji: '🟡' };
    if (s > 0.8) return { name: 'Lemon', emoji: '🟡' };
    return { name: 'Canary', emoji: '🟡' };
  }

  // Lime H 70-90
  if (h >= 70 && h < 90) {
    return { name: 'Lime', emoji: '🟢' };
  }

  // Green H 90-160
  if (h >= 90 && h < 160) {
    if (l < 0.30) return { name: 'Forest', emoji: '🟢' };
    if (s > 0.65 && l < 0.55) return { name: 'Emerald', emoji: '🟢' };
    if (s < 0.45) return { name: 'Sage', emoji: '🟢' };
    return { name: 'Jade', emoji: '🟢' };
  }

  // Teal/Cyan H 160-200
  if (h >= 160 && h < 200) {
    if (h < 180) return { name: 'Turquoise', emoji: '🔵' };
    return { name: 'Teal', emoji: '🔵' };
  }

  // Blue H 200-260
  if (h >= 200 && h < 260) {
    if (l <= 0.26) return { name: 'Navy', emoji: '🔵' };
    if (l > 0.65) return { name: 'Sky Blue', emoji: '🔵' };
    return { name: 'Cobalt', emoji: '🔵' };
  }

  // Indigo H 260-280
  if (h >= 260 && h < 280) {
    return { name: 'Indigo', emoji: '🟣' };
  }

  // Purple H 280-310
  if (h >= 280 && h < 310) {
    if (l > 0.70) return { name: 'Lavender', emoji: '🟣' };
    if (l < 0.35) return { name: 'Plum', emoji: '🟣' };
    return { name: 'Violet', emoji: '🟣' };
  }

  // Pink H 310-345
  if (h >= 310 && h < 345) {
    if (s > 0.75) return { name: 'Magenta', emoji: '🩷' };
    if (l < 0.55 && s > 0.6) return { name: 'Hot Pink', emoji: '🩷' };
    if (l > 0.75) return { name: 'Blush', emoji: '🩷' };
    return { name: 'Rose', emoji: '🩷' };
  }

  return { name: 'Grey', emoji: '🩶' };
}

export function getColorInfo(r: number, g: number, b: number, complex: boolean): ColorInfo {
  const [h, s, l] = rgbToHsl(r, g, b);
  const hex = rgbToHex(r, g, b);

  const { name, emoji } = complex
    ? getComplexName(h, s, l, r, g, b)
    : getSimpleName(h, s, l, r, g, b);

  return { name, hex, emoji };
}
