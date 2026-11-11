// Testy v prohlížeči: místní server se soubory appky, Chrome bez okna ve velikosti iPhonu
// a náhradní API (na skutečný skript nejde žádný požadavek).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { mockData } from './mock/data.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const API = 'https://script.google.com/macros/s/MOCK/exec';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

export async function serve() {
  const server = http.createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(ROOT, path));
      if (!file.startsWith(ROOT)) throw new Error('mimo kořen');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}/` };
}

// Náhradní skript: stejné akce a tvar odpovědí jako apps-script/Code.js
export function makeApi() {
  const api = {
    data: mockData(), calls: [], offline: false, version: 3, failSave: null, badKey: false,
    delay: { bootstrap: 0, saveWorkout: 0 },
    async handle(route) {
      if (api.offline) return route.abort('internetdisconnected');
      const body = JSON.parse(route.request().postData() || '{}');
      const call = { action: body.action, id: (body.workout && body.workout.id) || body.id, sets: body.sets && body.sets.length, end: body.workout && body.workout.end };
      api.calls.push(call);
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const reply = (obj) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(obj) });
      const fail = (code, error) => { call.failed = true; return reply({ ok: false, code, error }); };
      if (api.badKey) return fail('bad_key', 'Špatný klíč');
      let out = {};
      if (body.action === 'ping') out = { version: api.version, name: 'Mock' };
      else if (body.action === 'bootstrap') {
        // stav se čte na začátku (jako čtení listů), odpověď může přijít později
        out = JSON.parse(JSON.stringify({ version: api.version, ...api.data }));
        if (api.delay.bootstrap) await wait(api.delay.bootstrap);
      } else if (body.action === 'saveWorkout') {
        if (api.delay.saveWorkout) await wait(api.delay.saveWorkout);
        if (api.failSave && api.failSave(body)) return fail('bad_request', 'Zkušební chyba skriptu');
        const id = body.workout.id;
        api.data.workouts = api.data.workouts.filter((w) => w.id !== id).concat([body.workout]);
        api.data.sets = api.data.sets.filter((s) => s.workout !== id).concat(body.sets.map((s) => ({ ...s, workout: id })));
      } else if (body.action === 'deleteWorkout') {
        api.data.workouts = api.data.workouts.filter((w) => w.id !== body.id);
        api.data.sets = api.data.sets.filter((s) => s.workout !== body.id);
      } else if (body.action === 'saveExercise') {
        const found = api.data.exercises.find((e) => e.name.toLowerCase() === body.exercise.name.toLowerCase());
        if (!found) api.data.exercises.push(body.exercise);
        out = { exercise: found || body.exercise, added: !found };
      } else if (body.action === 'importWorkouts') {
        return fail('maintenance', 'Akce je povolená jen při údržbě');
      } else return fail('bad_request', 'Neznámá akce: ' + body.action);
      return reply({ ok: true, ...out });
    },
  };
  return api;
}

let shared = null;
export async function open({ api = makeApi(), configured = true, dark = true, clock = false, width = 393, height = 852 } = {}) {
  if (!shared) shared = await serve();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'cs-CZ', timezoneId: 'Europe/Prague', colorScheme: dark ? 'dark' : 'light', serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  await context.route(API, (r) => api.handle(r));
  const page = await context.newPage();
  const errors = [];
  const dialogs = [];
  let accept = true;
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('dialog', (d) => { dialogs.push(d.message()); return accept ? d.accept() : d.dismiss(); });
  if (configured) await context.addInitScript(([url]) => { if (!localStorage.getItem('reformer.config')) localStorage.setItem('reformer.config', JSON.stringify({ url, key: 'k'.repeat(20) })); }, [API]);
  if (clock) await page.clock.install({ time: new Date('2030-03-12T17:00:00+01:00') });
  await page.goto(shared.base);
  return { browser, context, page, api, errors, dialogs, base: shared.base, answer: (yes) => { accept = yes; } };
}

export const stopServer = () => { if (shared) shared.server.close(); shared = null; };

const esc = (s) => s.replace(/[()]/g, '\\$&');
export const card = (page, name) => page.locator('section.card.exercise', { has: page.locator('.ex-title strong', { hasText: new RegExp('^' + esc(name) + '$') }) });
export const rows = (c) => c.locator('.set-row:not(.head)');
export const pill = (page) => page.locator('.wbar .pill, .top .pill').first();

// Data v telefonu (IndexedDB) a fronta
export const phone = (page) => page.evaluate(() => new Promise((res) => {
  const q = indexedDB.open('reformer', 1);
  q.onsuccess = () => {
    const g = q.result.transaction('kv').objectStore('kv').get('bootstrap');
    g.onsuccess = () => res({ data: g.result, queue: JSON.parse(localStorage.getItem('reformer.queue') || '{}') });
  };
}));
