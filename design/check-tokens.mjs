// check-tokens.mjs — a cheap standing guard for the theme.
//
// Every screen now goes through theme.ts, which is the whole reason the SKIN flip is one line.
// That only holds while nothing references a token that doesn't exist or forgets to import the
// namespace it uses — both of which are runtime "undefined colour" bugs rather than build errors
// in React Native. This walks the source and checks both, without needing node_modules.
//
// Run: node design/check-tokens.mjs   (exit 1 on any problem)

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const theme = readFileSync(join(root, 'src/theme.ts'), 'utf8');

const keysOf = (name) => {
  const m = theme.match(new RegExp(`export const ${name}[^=]*= \\{([\\s\\S]*?)\\n\\};`));
  if (!m) throw new Error(`theme.ts has no exported ${name} object`);
  return new Set([...m[1].matchAll(/^ {2}(\w+):/gm)].map((x) => x[1]));
};

const DEFINED = { COLORS: keysOf('COLORS'), OVERLAY: keysOf('OVERLAY'), FONTS: keysOf('FONTS') };
const NS = Object.keys(DEFINED);

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
  );

const files = [join(root, 'App.tsx'), ...walk(join(root, 'src'))]
  .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('src/theme.ts') && !f.includes('__tests__'));

const used = { COLORS: new Set(), OVERLAY: new Set(), FONTS: new Set() };
const problems = [];

for (const f of files) {
  const rel = f.slice(root.length);
  const src = readFileSync(f, 'utf8');
  const imported = (src.match(/import \{([^}]*)\} from ['"][\w./]*theme['"]/) || [])[1] || '';
  for (const [, ns, key] of src.matchAll(/\b(COLORS|OVERLAY|FONTS)\.(\w+)/g)) {
    used[ns].add(key);
    if (!DEFINED[ns].has(key)) problems.push(`${rel}: ${ns}.${key} is not defined in theme.ts`);
  }
  for (const ns of NS) {
    if (new RegExp(`\\b${ns}\\.`).test(src) && !imported.includes(ns)) {
      problems.push(`${rel}: uses ${ns} but does not import it`);
    }
  }
}

// A hex literal isn't automatically wrong — chrome drawn over the live camera preview has to hold
// its own colour whatever the surfaces are doing. But it should be a deliberate exception, so they
// get counted and listed rather than passed over in silence.
const hexes = [];
for (const f of files) {
  const rel = f.slice(root.length);
  for (const [, hex] of readFileSync(f, 'utf8').matchAll(/['"](#[0-9a-fA-F]{3,8})['"]/g)) {
    hexes.push(`${rel} ${hex}`);
  }
}

for (const ns of NS) {
  const unused = [...DEFINED[ns]].filter((k) => !used[ns].has(k));
  console.log(`${ns}: ${DEFINED[ns].size} defined, ${used[ns].size} used${unused.length ? `, unused: ${unused.join(', ')}` : ''}`);
}
console.log(`files scanned: ${files.length}`);
console.log(`hex literals remaining: ${hexes.length}`);
console.log(hexes.map((h) => `  ${h}`).join('\n'));

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  console.log(problems.map((p) => `  ${p}`).join('\n'));
  process.exit(1);
}
console.log('\nno undefined or unimported tokens');
