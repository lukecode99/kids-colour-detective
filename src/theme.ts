// theme.ts — the app's palette, aligned to the paint-index website.
//
// The site and the app are one product, so they share a palette. What they can't share is
// brightness: the site is a page, the app is a viewfinder. A colour swatch surrounded by white
// looks different from the same swatch surrounded by dark — simultaneous contrast is exactly the
// effect a colour-matching tool has to avoid inflicting on its user. So `dark` is not "the old
// dark theme kept out of inertia"; it's the site's hues on surfaces that leave the colours alone.
//
// Both readings are here because the choice is Luke's, not the code's. Flip SKIN, rebuild, done —
// every screen goes through these tokens, so nothing else needs touching.
//
// One exception, and it's the only one: app.json's "userInterfaceStyle" has to move with SKIN.
// That setting governs the parts of the UI iOS draws for us — keyboards, alerts, action sheets —
// which can't read a TypeScript constant. Leave it on "dark" under the light skin and the keyboard
// comes up black against a paper-white app.
//   SKIN 'light' → "userInterfaceStyle": "light"
//   SKIN 'dark'  → "userInterfaceStyle": "dark"
//
//   'dark'  — site palette, dark chrome. Matches at a glance, camera behaviour unchanged.
//   'light' — site palette used literally. Strongest brand match; changes how Scan reads.

export type SkinName = 'dark' | 'light';

// `as SkinName` rather than `: SkinName`. With the annotation form, TypeScript's control-flow
// analysis narrows a const to its initialiser's literal type, so the `=== 'light'` below becomes a
// comparison it has proved impossible and it errors. The assertion widens it back to the union,
// which is the honest type here: this line is meant to be edited.
export const SKIN = 'light' as SkinName;

// The site's own values, lifted from paint-index's :root block. Kept verbatim rather than
// re-picked by eye, so "the same blue" means the same blue and not a near miss.
const SITE = {
  paper: '#FAF7F2',
  card: '#FFFFFF',
  ink: '#221F1A',
  mut: '#7A736A',
  line: '#E9E2D8',
  accent: '#2456E6',
  accentSoft: '#E8EEFF',
  good: '#0A7D4F',
  goodBg: '#E5F5EC',
  bad: '#B3382E',
  badBg: '#FBE9E7',
  promo: '#A36A00',
  promoBg: '#FFF1D6',
  onAccent: '#FFFFFF',
  // Subtle fills and hairlines. On dark these were white washes; on paper they have to be washes
  // of the ink instead, or every chip, divider and swatch outline disappears. Same idea either
  // way — a few percent of the opposite of the surface — which is why they belong in the skin
  // rather than being written literally at 40-odd call sites.
  fill: 'rgba(34,31,26,0.04)',
  fillStrong: 'rgba(34,31,26,0.07)',
  hairline: 'rgba(34,31,26,0.14)',
  hairlineStrong: 'rgba(34,31,26,0.22)',
  // The two text tokens are not the same alpha as their dark counterparts, on purpose. Ink on
  // paper at 0.35 is fainter than white on near-black at 0.35, because the surfaces aren't equally
  // far from their text colour. These alphas were picked to land on the same contrast ratio the
  // dark skin already has (2.7 and 3.2), so "faint" looks equally faint either way rather than
  // equally transparent.
  placeholder: 'rgba(34,31,26,0.45)',
  textFaint: 'rgba(34,31,26,0.50)',
};

// The same palette re-grounded on dark surfaces. The greys carry the site's warmth (they are
// browns, not blue-blacks) so the family reads as one; the accent and the status colours are
// lifted in luminance only as far as they need to be legible on those surfaces.
const SITE_DARK = {
  paper: '#17150F',
  card: '#211E17',
  ink: '#F4F0E8',
  mut: '#A39A8B',
  line: '#332E24',
  accent: '#6E8BFF',
  accentSoft: '#232842',
  good: '#5BC98E',
  goodBg: '#17301F',
  bad: '#E2796C',
  badBg: '#331C19',
  promo: '#E0AC4A',
  promoBg: '#332616',
  onAccent: '#0F1220',
  fill: 'rgba(255,255,255,0.06)',
  fillStrong: 'rgba(255,255,255,0.12)',
  hairline: 'rgba(255,255,255,0.15)',
  hairlineStrong: 'rgba(255,255,255,0.25)',
  placeholder: 'rgba(255,255,255,0.30)',
  textFaint: 'rgba(255,255,255,0.35)',
};

const P = SKIN === 'light' ? SITE : SITE_DARK;

export const COLORS = {
  bg: P.paper,
  card: P.card,
  border: P.line,
  text: P.ink,
  textMuted: P.mut,

  // Status colours. These exist so the camera screen's calibration states stop carrying their own
  // hardcoded greens and ambers — the site already has a word for "good" and a word for "caution",
  // and two products shouldn't disagree about what green means.
  good: P.good,
  goodBg: P.goodBg,
  bad: P.bad,
  badBg: P.badBg,
  warn: P.promo,
  warnBg: P.promoBg,

  // Text/icon colour to place *on* an accent fill. Not white in every skin.
  onAccent: P.onAccent,
  accentSoft: P.accentSoft,

  // The site has one accent and no gradients. `purple` is kept as a name because nine call sites
  // still use it, but it now resolves to the same accent — which is what collapses the old
  // blue→purple gradient into the site's single-accent language without touching those files.
  blue: P.accent,
  purple: P.accent,

  // Subtle chrome: chip and input fills, dividers, swatch outlines, disabled and placeholder text.
  // Roughly forty call sites used to write these as `rgba(255,255,255,0.08)` and friends, which is
  // only a visible thing on a dark surface — on paper they render as nothing at all. Routed through
  // the skin, "faint mark on the current surface" keeps meaning that in both directions.
  fill: P.fill,
  fillStrong: P.fillStrong,
  hairline: P.hairline,
  hairlineStrong: P.hairlineStrong,
  placeholder: P.placeholder,
  textFaint: P.textFaint,

  // Legacy aliases kept so existing code compiles unchanged.
  surface: P.card,
  accent: P.accent,
  accentBlue: P.accent,
};

// Chrome that sits on top of the live camera preview — the calibration bars, the stability
// readout, the torch button. These deliberately do NOT follow SKIN: whatever the app's surfaces
// are doing, this text is over a photograph, and a token that reads well on paper does not read
// well on someone's living-room wall. They're the site's green and amber pushed up in luminance
// until they survive an arbitrary background, which is the same reason the site's own --good is
// dark and these aren't.
export const OVERLAY = {
  good: '#5BC98E',
  warn: '#E0AC4A',
  warnSoft: '#FFE1AC',
  onWarn: '#1A0F00',

  // The reticle, the loupe outline, the marker rings on the colour wheel. These sit on top of a
  // photograph or an arbitrary paint colour, never on an app surface, so they stay white in both
  // skins — a hairline in the ink colour would vanish the moment someone points the camera at a
  // dark wall. Named rather than left as literals so the distinction is legible in the diff.
  ring: 'rgba(255,255,255,0.9)',
  ringSoft: 'rgba(255,255,255,0.4)',
};

export const FONTS = {
  colorName: { fontSize: 52, fontWeight: '800' as const, letterSpacing: -1 },
  colorNameSub: { fontSize: 22, fontWeight: '600' as const },
  toggle: { fontSize: 14, fontWeight: '700' as const },
};
