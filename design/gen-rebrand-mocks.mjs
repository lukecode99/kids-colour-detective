// gen-rebrand-mocks.mjs — Colour Detective restyled to the paint-index house style.
//
// Design sign-off artefact ONLY. Nothing here touches the app: the standing rule is that Luke
// signs off a design before any CD rebuild code is written, so this renders the proposal as HTML
// rather than shipping it.
//
// Two things are deliberately real rather than drawn:
//   - the design tokens come out of paint-index's own stylesheet (gen-mocks.mjs), read at build
//     time, so the mock can't drift from the live site;
//   - the paint matches come out of the app's own deltaE2000 + its real 8,200-colour dataset, so
//     the percentages and colour names on the cards are what the app would actually show.
// The one invented thing is the sampled colour itself, and it's labelled as an example.
//
// Run: node design/gen-rebrand-mocks.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { deltaE2000, rgbToLab, hexToRgb } from './lib-colormath.mjs';

const HERE = new URL('./', import.meta.url).pathname;
mkdirSync(HERE, { recursive: true });

// ---- the site's tokens, read from the site (not retyped) -------------------------------------
const SITE_CSS_FILE = '/workspace/agent/projects/paint-index/gen-mocks.mjs';
const siteSrc = readFileSync(SITE_CSS_FILE, 'utf8');
const rootBlock = siteSrc.match(/:root\{([\s\S]*?)\}/)[1];
const SITE = Object.fromEntries(
  [...rootBlock.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])
);
const FONTS_LINK = siteSrc.match(/const FONTS = `([^`]*)`/)[1];

// ---- the app's real data ---------------------------------------------------------------------
const PAINTS = JSON.parse(
  execFileSync('git', ['show', 'origin/main:src/data/paints.json'], {
    cwd: '/workspace/agent/projects/kids-colour-detective', maxBuffer: 1 << 28,
  }).toString()
);

function matchPaints(hex, limit = 5, filter = () => true) {
  const lab = rgbToLab(...hexToRgb(hex));
  const top = [];
  for (const p of PAINTS) {
    if (!filter(p)) continue;
    const dE = deltaE2000(lab, p.lab);
    if (top.length < limit) { top.push({ p, dE }); top.sort((a, b) => a.dE - b.dE); }
    else if (dE < top[top.length - 1].dE) { top[top.length - 1] = { p, dE }; top.sort((a, b) => a.dE - b.dE); }
  }
  // closenessLabel + matchPercent, copied from src/utils/paintMatcher.ts so the bands match.
  return top.map(({ p, dE }) => ({
    paint: p,
    deltaE: dE,
    matchPercent: Math.max(0, Math.min(100, Math.round(100 - 2 * dE))),
    closeness: dE < 1 ? 'Indistinguishable' : dE < 5 ? 'Very close' : dE <= 10 ? 'Close' : 'Different colour',
  }));
}

// An example wall colour. Everything downstream of it is computed, not chosen.
const SAMPLE = '#7F9B6E';
const MATCHES = matchPaints(SAMPLE, 5);
const SWAPS = ['Crown', 'Johnstone\'s', 'Valspar'].map((brand) => {
  const [m] = matchPaints(MATCHES[0].paint.hex, 1, (p) => p.brand === brand);
  return m;
}).filter(Boolean);

// ---- the two candidate skins -----------------------------------------------------------------
// A: the site's palette used literally — the app becomes the site.
// B: the site's *hues* on dark surfaces — same family, camera-safe.
const SKINS = {
  light: {
    id: 'light', name: 'A · Site palette, literally',
    blurb: 'The app adopts paper, ink and accent exactly as the website uses them. Strongest brand match; changes how the camera screen reads.',
    paper: SITE.paper, card: SITE.card, ink: SITE.ink, mut: SITE.mut, line: SITE.line,
    accent: SITE.accent, accentSoft: SITE['accent-soft'],
    good: SITE.good, goodBg: SITE['good-bg'], bad: SITE.bad, badBg: SITE['bad-bg'],
    promo: SITE.promo, promoBg: SITE['promo-bg'],
    chrome: SITE.card, onAccent: '#fff', shadow: 'rgba(0,0,0,.07)',
  },
  dark: {
    id: 'dark', name: 'B · Site palette on dark chrome',
    blurb: 'Same typeface, same accent, same badge language — but the surfaces stay dark so the live preview and swatches keep their colour. Brand match at a distance, camera behaviour unchanged.',
    paper: '#17150F', card: '#211E17', ink: '#F4F0E8', mut: '#A39A8B', line: '#332E24',
    accent: '#6E8BFF', accentSoft: '#232842',
    good: '#5BC98E', goodBg: '#17301F', bad: '#E2796C', badBg: '#331C19',
    promo: '#E0AC4A', promoBg: '#332616',
    chrome: '#211E17', onAccent: '#0F1220', shadow: 'rgba(0,0,0,.5)',
  },
};

// ---- what's on screen now, read from the app's own theme.ts ----------------------------------
const themeTs = execFileSync('git', ['show', 'origin/main:src/theme.ts'], {
  cwd: '/workspace/agent/projects/kids-colour-detective',
}).toString();
const NOW = Object.fromEntries(
  [...themeTs.matchAll(/^\s*([a-zA-Z]+):\s*'(#[0-9A-Fa-f]{3,8})'/gm)].map((m) => [m[1], m[2]])
);

const TOKEN_MAP = [
  ['Background', NOW.bg, 'paper', 'the whole app inverts light↔dark'],
  ['Card / surface', NOW.card, 'card', 'panels become white with a warm hairline'],
  ['Hairline', NOW.border, 'line', ''],
  ['Text', NOW.text, 'ink', ''],
  ['Muted text', NOW.textMuted, 'mut', ''],
  ['Accent', NOW.blue, 'accent', 'app blue → site blue; the purple has no counterpart on the site'],
  ['Second accent', NOW.purple, null, 'site has one accent only — the blue→purple gradient goes'],
];

// ---- rendering -------------------------------------------------------------------------------

const ICONS = {   // lifted verbatim from App.tsx so the tab bar is the app's, not a redrawing
  scan: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  brandmatch: '<path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 8.7l5.4-.8z"/>',
  planner: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6L6 18"/>',
  saved: '<path d="M19 21l-7-4.5L5 21V5a2 2 0 012-2h10a2 2 0 012 2z"/>',
};
const TABS = [['scan', 'Scan'], ['brandmatch', 'Brand Swap'], ['planner', 'Planner'], ['saved', 'Saved']];

const tabBar = (active) => `<div class="tabbar">${TABS.map(([k, label]) => `
  <div class="tab${k === active ? ' on' : ''}">
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg><b>${label}</b>
    ${k === active ? '<i></i>' : ''}
  </div>`).join('')}</div>`;

const matchRow = (m, i) => `
  <div class="mrow">
    <span class="dab" style="background:${m.paint.hex}"></span>
    <div class="mtext"><b>${m.paint.name}</b><u>${m.paint.brand}</u></div>
    <div class="mpct"><b>${m.matchPercent}%</b><u>${m.closeness}</u></div>
    <span class="buy">Buy</span>
  </div>`;

// The three screens. Content is identical across skins — only the tokens change, which is the
// whole point of showing them side by side.
const screens = [
  { title: 'Scan — result', active: 'scan', body: `
    <div class="preview"><span class="reticle"></span><em>Hold steady over the colour</em></div>
    <div class="card hero">
      <span class="dab lg" style="background:${SAMPLE}"></span>
      <div><h2>${MATCHES[0].paint.name}</h2>
      <p class="sm mut">Closest of 8,200 colours · ΔE ${MATCHES[0].deltaE.toFixed(1)}</p></div>
      <span class="badge good">${MATCHES[0].closeness}</span>
    </div>
    <div class="kicker">Top matches</div>
    ${MATCHES.map(matchRow).join('')}` },
  { title: 'Brand Swap', active: 'brandmatch', body: `
    <div class="card hero">
      <span class="dab lg" style="background:${MATCHES[0].paint.hex}"></span>
      <div><h2>${MATCHES[0].paint.name}</h2><p class="sm mut">${MATCHES[0].paint.brand}</p></div>
    </div>
    <div class="insight"><b>Same colour, different tin.</b> Nearest equivalent in each brand we hold.</div>
    <div class="kicker">Equivalents</div>
    ${SWAPS.map(matchRow).join('')}` },
  { title: 'Saved', active: 'saved', body: `
    <div class="seg"><span class="on">All</span><span>Interior</span><span>Exterior</span></div>
    <div class="kicker">4 colours saved</div>
    ${MATCHES.slice(0, 4).map((m) => `
      <div class="card sv">
        <span class="dab lg" style="background:${m.paint.hex}"></span>
        <div class="mtext"><b>${m.paint.name}</b><u>${m.paint.brand} · ${m.paint.code}</u></div>
        <span class="badge">${m.matchPercent}%</span>
      </div>`).join('')}` },
];

const skinCss = (s) => `
.pf[data-skin="${s.id}"]{--paper:${s.paper};--card:${s.card};--ink:${s.ink};--mut:${s.mut};
  --line:${s.line};--accent:${s.accent};--accent-soft:${s.accentSoft};--good:${s.good};
  --good-bg:${s.goodBg};--promo:${s.promo};--promo-bg:${s.promoBg};--on-accent:${s.onAccent};
  --shadow:${s.shadow}}`;

const frame = (s, sc) => `
<div class="pf" data-skin="${s.id}">
  <div class="topbar"><span class="logo"><i></i>Colour Detective</span><span class="ib">?</span></div>
  <div class="scr">${sc.body}</div>
  ${tabBar(sc.active)}
</div>`;

const swatch = (hex) => hex ? `<span class="sw" style="background:${hex}"></span><code>${hex}</code>` : '<span class="none">—</span>';

const html = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Colour Detective — house-style proposal</title>
${FONTS_LINK}
<style>
:root{--pg:#faf7f2;--pi:#221f1a;--pm:#7a736a;--pl:#e9e2d8}
*{box-sizing:border-box;margin:0}
body{background:var(--pg);color:var(--pi);font:15px/1.55 Inter,-apple-system,sans-serif;padding:26px 18px 60px}
.wrap{max-width:1180px;margin:0 auto}
h1{font-family:Fraunces,Georgia,serif;font-size:31px;letter-spacing:-.02em}
h3{font-family:Fraunces,Georgia,serif;font-size:21px;margin:34px 0 4px}
p.lede{color:var(--pm);max-width:74ch;margin-top:7px}
table{border-collapse:collapse;width:100%;margin-top:12px;font-size:13.5px;background:#fff;
  border:1px solid var(--pl);border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--pl);vertical-align:middle}
th{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--pm)}
tr:last-child td{border-bottom:none}
.sw{display:inline-block;width:15px;height:15px;border-radius:4px;border:1px solid rgba(0,0,0,.12);
  vertical-align:-3px;margin-right:6px}
code{font:12px/1 ui-monospace,monospace;color:var(--pm)}
.none{color:var(--pm)}
.cols{display:flex;gap:34px;flex-wrap:wrap;margin-top:16px}
.col{flex:1;min-width:430px}
.col > h4{font-family:Fraunces,serif;font-size:18px;margin-bottom:3px}
.col > p{font-size:13px;color:var(--pm);margin-bottom:14px;max-width:52ch}
.row{display:flex;gap:14px;flex-wrap:wrap}
.cap{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--pm);margin:0 0 6px 2px}

/* --- the phone frames ------------------------------------------------------------------ */
${Object.values(SKINS).map(skinCss).join('')}
.pf{width:268px;border-radius:24px;overflow:hidden;background:var(--paper);color:var(--ink);
  border:1px solid var(--line);box-shadow:0 10px 30px var(--shadow);display:flex;flex-direction:column}
.pf .topbar{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;
  background:var(--card);border-bottom:1px solid var(--line)}
.pf .logo{font-family:Fraunces,serif;font-weight:700;font-size:15px;letter-spacing:-.02em}
.pf .logo i{display:inline-block;width:10px;height:10px;border-radius:50% 50% 50% 3px;
  background:var(--accent);margin-right:6px;transform:rotate(-45deg)}
.pf .ib{width:24px;height:24px;border-radius:50%;border:1px solid var(--line);display:grid;
  place-items:center;font-size:11px;color:var(--mut)}
.pf .scr{padding:12px;flex:1;display:flex;flex-direction:column;gap:7px}
.pf h2{font-family:Fraunces,serif;font-size:17px;line-height:1.15;letter-spacing:-.01em}
.pf .sm{font-size:11px} .pf .mut{color:var(--mut)}
.pf .kicker{font-size:9.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  color:var(--mut);margin:7px 0 1px}
.pf .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:11px;
  display:flex;gap:10px;align-items:center}
.pf .card.hero{align-items:center}
.pf .dab{width:26px;height:26px;border-radius:50% 50% 50% 7px;flex:none;
  border:1px solid rgba(128,128,128,.28)}
.pf .dab.lg{width:38px;height:38px;border-radius:50% 50% 50% 10px}
.pf .badge{margin-left:auto;font-size:9.5px;font-weight:700;border-radius:999px;padding:2px 8px;
  background:var(--paper);color:var(--mut);flex:none}
.pf .badge.good{background:var(--good-bg);color:var(--good)}
.pf .preview{height:104px;border-radius:14px;background:
  linear-gradient(140deg,#6d8a5e,#8fa87c 45%,#5c7550);display:grid;place-items:center;position:relative}
.pf .preview em{position:absolute;bottom:7px;font-style:normal;font-size:9.5px;font-weight:600;
  color:#fff;background:rgba(0,0,0,.42);padding:2px 8px;border-radius:999px}
.pf .reticle{width:40px;height:40px;border-radius:50%;border:2.5px solid #fff;
  box-shadow:0 0 0 2px rgba(0,0,0,.25),inset 0 0 0 2px rgba(0,0,0,.25)}
.pf .mrow{display:flex;gap:9px;align-items:center;background:var(--card);border:1px solid var(--line);
  border-radius:12px;padding:7px 9px}
.pf .mtext{min-width:0;flex:1} .pf .mtext b{display:block;font-size:11.5px;font-weight:700;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pf .mtext u{display:block;font-size:10px;color:var(--mut);text-decoration:none}
.pf .mpct{text-align:right;flex:none} .pf .mpct b{display:block;font-size:11.5px}
.pf .mpct u{display:block;font-size:9px;color:var(--mut);text-decoration:none}
.pf .buy{flex:none;font-size:10px;font-weight:700;background:var(--accent);color:var(--on-accent);
  border-radius:8px;padding:4px 9px}
.pf .insight{background:var(--accent-soft);border-radius:12px;padding:9px 11px;font-size:11px}
.pf .insight b{color:var(--accent)}
.pf .seg{display:flex;background:var(--card);border:1px solid var(--line);border-radius:11px;
  padding:2px;gap:2px}
.pf .seg span{flex:1;text-align:center;padding:6px 2px;border-radius:9px;font-size:10.5px;
  font-weight:600;color:var(--mut)}
.pf .seg span.on{background:var(--ink);color:var(--paper)}
.pf .card.sv .mtext b{font-size:12px}
.pf .tabbar{display:flex;background:var(--card);border-top:1px solid var(--line);padding:6px 0 8px}
.pf .tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;color:var(--mut);
  position:relative}
.pf .tab b{font-size:8.5px;font-weight:600}
.pf .tab.on{color:var(--accent)}
.pf .tab.on i{position:absolute;top:-6px;width:22px;height:2.5px;border-radius:2px;background:var(--accent)}
</style>
<div class="wrap">
<h1>Colour Detective in the paint-index house style</h1>
<p class="lede">A proposal, not a build — per the standing rule, no rebuild code gets written until you've
signed a design off. The tokens below are read out of the website's own stylesheet at render time, and
every paint name and match percentage on the phones is real output from the app's own ΔE2000 against its
8,200-colour dataset. The only invented thing on the page is the example sampled colour, <code>${SAMPLE}</code>.</p>

<h3>What changes</h3>
<table>
<tr><th>Token</th><th>App today</th><th>Website</th><th>Consequence</th></tr>
${TOKEN_MAP.map(([label, now, key, note]) => `<tr><td><b>${label}</b></td><td>${swatch(now)}</td>
  <td>${swatch(key ? SITE[key] : null)}</td><td class="mut">${note}</td></tr>`).join('')}
<tr><td><b>Type</b></td><td><code>system default</code></td>
  <td><code>Fraunces</code> display + <code>Inter</code> body</td>
  <td>needs <code>expo-font</code> added — it isn't a dependency today</td></tr>
</table>

<h3>The one real decision</h3>
<p class="lede">Everything above is mechanical. This isn't: the site is light and the app is dark, and the
app is dark for a reason — it wraps a live camera preview and a colour swatch, and a bright surround
shifts how you perceive the colour sitting next to it. So there are two honest ways to "match the site",
and they trade brand fidelity against the thing the app is actually for. Both are below with identical
content.</p>

<div class="cols">
${Object.values(SKINS).map((s) => `
  <div class="col">
    <h4>${s.name}</h4><p>${s.blurb}</p>
    <div class="row">${screens.map((sc) => `<div><p class="cap">${sc.title}</p>${frame(s, sc)}</div>`).join('')}</div>
  </div>`).join('')}
</div>

<h3>Notes</h3>
<p class="lede">Both skins drop the blue→purple gradient on the active tab: the site has a single accent
and no gradient anywhere, so keeping it is the one thing that would still read as a different product.
The green/amber calibration states in the camera screen map onto the site's existing
<code>--good</code> and <code>--promo</code> pairs rather than needing new colours.
Roughly three quarters of the app's colour usage already goes through <code>theme.ts</code>
(145 references against 50 hardcoded values, 26 of which are plain black or white), so whichever
you pick, most of the work is one file.</p>
</div>`;

writeFileSync(HERE + 'cd-rebrand-proposal.html', html);
console.log('wrote design/cd-rebrand-proposal.html');
console.log('sample', SAMPLE, '→', MATCHES.map((m) => `${m.paint.brand} ${m.paint.name} ${m.matchPercent}%`).join(' | '));
console.log('swaps', SWAPS.map((m) => `${m.paint.brand} ${m.paint.name} ${m.matchPercent}%`).join(' | '));
