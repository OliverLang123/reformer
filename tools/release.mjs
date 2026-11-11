// Příprava vydání appky: node tools/release.mjs <verze>   (např. 0.7.1)
// - přepíše verzi v sw.js (CACHE) a app.js (VERSION)
// - zkontroluje, že každý soubor, který appka načítá, je v seznamu SHELL v sw.js (jinak by offline chyběl)
// - pustí npm test
// Nic necommituje ani nenasazuje, na konci vypíše další kroky.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const version = process.argv[2];
const checkOnly = process.argv.includes('--check');
const isMain = !!process.argv[1] && relative(process.argv[1], fileURLToPath(import.meta.url)) === '';
if (isMain && !checkOnly && !/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Použití: node tools/release.mjs <verze ve tvaru 0.7.1>   nebo   node tools/release.mjs --check');
  process.exit(1);
}

// Seznam SHELL tak, jak ho vyhodnotí service worker
export function shellList(source = read('sw.js')) {
  const ctx = vm.createContext({ self: { addEventListener() {}, location: {} }, caches: {}, Request: class {} });
  vm.runInContext(source.replace(/^const SHELL = /m, 'SHELL = ').replace(/^const CACHE = /m, 'CACHE = '), ctx);
  return { shell: ctx.SHELL, cache: ctx.CACHE };
}

// Všechny soubory, které appka načítá: importy od app.js, odkazy z index.html a ze šablony obrázku
export function appFiles() {
  const found = new Set(['index.html', 'sw.js']);
  const add = (from, ref) => {
    if (/^(https?:|data:|blob:|#)/.test(ref)) return;
    const file = normalize(join(dirname(from), ref.split(/[?#]/)[0]));
    if (file.startsWith('..') || found.has(file) || !existsSync(join(ROOT, file))) return;
    found.add(file);
    if (/\.(js|mjs)$/.test(file)) {
      const src = read(file);
      for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) add(file, m[1] || m[2]);
    }
    if (/\.css$/.test(file)) for (const m of read(file).matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) add(file, m[1]);
    if (/\.html$/.test(file)) for (const m of read(file).matchAll(/(?:src|href)=["']([^"']+)["']/g)) add(file, m[1]);
  };
  for (const m of read('index.html').matchAll(/(?:src|href)=["']([^"']+)["']/g)) add('index.html', m[1]);
  // Načítané za běhu (js/strava.js): šablona obrázku a knihovna pro snímek
  add('index.html', 'design/workout-summary-ember/template/summary.html');
  add('index.html', 'vendor/html-to-image.js');
  found.delete('sw.js');
  return [...found].sort();
}

export function missingFromShell() {
  const { shell } = shellList();
  const listed = new Set(shell.map((f) => (f === './' ? 'index.html' : f)));
  return {
    missing: appFiles().filter((f) => !listed.has(f)),
    dead: shell.filter((f) => f !== './' && !existsSync(join(ROOT, f))),
  };
}

if (isMain) {
  const { missing, dead } = missingFromShell();
  if (missing.length || dead.length) {
    if (missing.length) console.error('V seznamu SHELL v sw.js chybí (offline by nefungovalo):\n  ' + missing.join('\n  '));
    if (dead.length) console.error('V seznamu SHELL jsou soubory, které neexistují:\n  ' + dead.join('\n  '));
    process.exit(1);
  }
  console.log('Seznam SHELL v sw.js je úplný.');
  if (!checkOnly) {
    const sw = read('sw.js');
    const app = read('app.js');
    const sw2 = sw.replace(/const CACHE = 'reformer-v[^']*';/, `const CACHE = 'reformer-v${version}';`);
    const app2 = app.replace(/export const VERSION = '[^']*';/, `export const VERSION = '${version}';`);
    if (!sw2.includes(`reformer-v${version}`) || !app2.includes(`VERSION = '${version}'`)) {
      console.error('Verzi se nepodařilo zapsat (změnil se tvar řádku CACHE nebo VERSION).');
      process.exit(1);
    }
    writeFileSync(join(ROOT, 'sw.js'), sw2);
    writeFileSync(join(ROOT, 'app.js'), app2);
    console.log(`Verze ${version} zapsaná do sw.js a app.js.`);
  }
  execFileSync('npm', ['test'], { cwd: ROOT, stdio: 'inherit' });
  if (!checkOnly) {
    console.log(`
Další kroky:
  1. npm run test:e2e
  2. Doplň CHANGELOG.md (bez osobních údajů) a PROGRESS.md (místní).
  3. Když se měnil skript: REFORMER_DEPLOYMENT=<ID nasazení> npm run deploy:script, pak v editoru setup.
     Nejdřív skript, potom appka.
  4. git commit a push (GitHub Pages nasadí appku).
  5. Na iPhonu ověř verzi ${version} na úvodu.`);
  }
}
