// Testy v prohlížeči proti náhradnímu API: node test/e2e.mjs [název případu]
import assert from 'node:assert/strict';
import { open, makeApi, card, rows, pill, phone, stopServer } from './harness.mjs';

const only = process.argv[2];
const results = [];
async function scenario(name, fn) {
  if (only && only !== name) return;
  const t = Date.now();
  let ctx = null;
  try {
    await fn(async (opts) => { ctx = await open(opts); return ctx; });
    if (ctx) assert.deepEqual(ctx.errors, [], 'chyby v konzoli');
    results.push([name, true, Date.now() - t]);
  } catch (e) {
    results.push([name, false, Date.now() - t, String(e && e.stack || e).split('\n').slice(0, 12).join('\n')]);
  } finally {
    if (ctx) await ctx.browser.close();
  }
}

const A = 'Silový trénink A';
const startA = async (page) => {
  await page.waitForSelector('section.card.routine');
  await page.locator('section.card.routine', { hasText: A }).getByText('Začít trénink').click();
  await page.waitForSelector('section.card.exercise');
};
const saved = (page) => page.waitForFunction(() => document.querySelector('.wbar .pill')?.textContent === 'Uloženo');
const box = async (loc) => { const b = await loc.first().boundingBox(); return [Math.round(b.width), Math.round(b.height)]; };

await scenario('trenink', async (go) => {
  const { page, api, dialogs, answer } = await go({ clock: true });
  await startA(page);
  const sq = card(page, 'Squat (Barbell)');

  // velikosti v řádku série
  const check = await box(sq.locator('.check')); const del = await box(sq.locator('.del')); const num = await box(sq.locator('.set-num'));
  assert.ok(check[0] >= 48 && check[1] >= 48, '✓ ' + check);
  assert.ok(del[0] >= 40 && del[1] >= 48, '✕ ' + del);
  assert.ok(num[0] >= 44 && num[1] >= 48, 'číslo série ' + num);
  const gap = await sq.evaluate((el) => Math.round(el.querySelector('.del').getBoundingClientRect().left - el.querySelector('.check').getBoundingClientRect().right));
  assert.ok(gap >= 12, 'mezera ✓ a ✕ ' + gap);

  // neplatné číslo: při psaní se druhá čárka zahodí
  await rows(sq).nth(1).locator('.f-kg').fill('100,,5');
  assert.equal(await rows(sq).nth(1).locator('.f-kg').inputValue(), '100,5');
  await rows(sq).nth(1).locator('.f-kg').fill('');

  // rozcvička, pak 102,5 a převzetí váhy do dalších sérií
  await rows(sq).nth(0).locator('.check').click();
  await rows(sq).nth(1).locator('.f-kg').fill('102,5');
  await rows(sq).nth(1).locator('.check').click();
  assert.equal(await rows(sq).nth(2).locator('.f-kg').getAttribute('placeholder'), '102,5');
  assert.equal(await rows(sq).nth(0).locator('.f-kg').inputValue(), '50');
  assert.match(await page.locator('.rest-bar strong').textContent(), /2:\d\d/);
  await saved(page);

  // ✕ u nepotvrzené: dotaz, Zrušit nic nesmaže
  answer(false);
  await rows(sq).nth(3).locator('.del').click();
  assert.equal(await rows(sq).count(), 4);
  assert.equal(dialogs.at(-1), 'Smazat sérii?');
  // ✕ u potvrzené: dotaz, smazání, Vrátit
  answer(true);
  await rows(sq).nth(1).locator('.del').click();
  assert.equal(dialogs.at(-1), 'Smazat potvrzenou sérii?');
  assert.equal(await rows(sq).count(), 3);
  await page.locator('.toast-btn').click();
  assert.equal(await rows(sq).count(), 4);
  assert.equal(await rows(sq).nth(1).locator('.f-kg').inputValue(), '102,5');
  assert.ok(await rows(sq).nth(1).evaluate((e) => e.classList.contains('done')));

  // superset: odpočinek až po druhém cviku
  await page.locator('.rest-bar .primary').click();
  await rows(card(page, 'Single Leg Calf Raise')).nth(0).locator('.check').click();
  assert.equal(await page.locator('.rest-bar').count(), 0);
  await rows(card(page, 'Leg Raise')).nth(0).locator('.check').click();
  assert.equal(await page.locator('.rest-bar').count(), 1);

  // offline: série se uloží v telefonu a po obnovení spojení odešle
  api.offline = true;
  await rows(card(page, 'Pull Up')).nth(0).locator('.check').click();
  await page.clock.runFor(1500);
  assert.equal(await pill(page).textContent(), 'Čeká na odeslání');
  await page.reload();
  await page.waitForSelector('section.card.exercise');
  assert.equal(await page.locator('.set-row.done').count(), 5);
  api.offline = false;
  await page.clock.runFor(31000);
  await saved(page);

  // poznámka k tréninku jde psát během tréninku
  await page.getByText('+ Poznámka k tréninku').click();
  await page.locator('.wnote').fill('Zkušební poznámka');

  // dokončit a uložit
  await page.locator('.wbar .primary').click();
  await page.getByText('Uložit trénink').click();
  await page.waitForSelector('.strava-img img', { timeout: 30000 });
  const last = api.calls.filter((c) => c.action === 'saveWorkout').at(-1);
  assert.equal(last.sets, 5);
  assert.ok(last.end);
  const w = api.data.workouts.find((x) => x.id === last.id);
  assert.equal(w.note, 'Zkušební poznámka');

  // souhrn přežije nové načtení appky, Zpět na úvod ho zavře
  await page.reload();
  await page.waitForSelector('.strava-img img', { timeout: 30000 });
  await page.getByText('Zpět na úvod').click();
  await page.waitForSelector('.history-item');
  await page.reload();
  await page.waitForSelector('section.card.routine');
  assert.equal(await page.locator('.strava-img').count(), 0);
  // historie ukazuje délku a objem
  assert.match(await page.locator('.history-item').first().textContent(), /min|h/);
});

await scenario('zavod-obnoveni', async (go) => {
  const { page, api } = await go();
  await startA(page);
  const sq = card(page, 'Squat (Barbell)');
  await rows(sq).nth(0).locator('.check').click();
  await saved(page);
  await rows(sq).nth(1).locator('.check').click();
  await saved(page);
  api.delay.saveWorkout = 1500; api.delay.bootstrap = 3000;
  await page.locator('.wbar .primary').click();
  await page.getByText('Uložit trénink').click();
  await page.getByText('Zpět na úvod').click();
  await page.waitForTimeout(9000);
  const id = api.calls.filter((c) => c.action === 'saveWorkout').at(-1).id;
  const p = await phone(page);
  const w = p.data.workouts.find((x) => x.id === id);
  assert.ok(w && w.end, 'trénink v telefonu má konec');
  assert.equal(p.data.sets.filter((s) => s.workout === id).length, 2);
  assert.equal(Object.keys(p.queue).length, 0);
  await page.locator('.history-item').first().click();
  await page.waitForSelector('.past-ex');
  assert.doesNotMatch(await page.locator('.sum-grid').first().textContent(), /Délka-/);
});

await scenario('fronta-chyba', async (go) => {
  const { page, api, answer } = await go();
  await page.waitForSelector('.history-item');
  const failId = api.data.workouts.at(-1).id;
  api.failSave = (b) => b.workout.id === failId;
  // úprava starého tréninku, kterou skript odmítne
  await page.locator('.history-item').first().click();
  await page.waitForSelector('.past-ex');
  await page.getByRole('button', { name: 'Upravit' }).click();
  await page.waitForSelector('section.card.exercise');
  await page.locator('.wbar .primary').click();
  await page.waitForTimeout(600);
  await page.goto(page.url().split('#')[0]);
  await startA(page);
  await rows(card(page, 'Squat (Barbell)')).nth(0).locator('.check').click();
  await page.waitForTimeout(1500);
  // nový trénink se odeslal, i když starý selhává
  assert.ok(api.data.workouts.some((w) => w.id !== failId && api.calls.some((c) => c.action === 'saveWorkout' && c.id === w.id && !c.failed)), 'nový trénink je na serveru');
  assert.equal(await pill(page).textContent(), 'Chyba odeslání');
  await pill(page).click();
  assert.match(await page.locator('.toast').textContent(), /Zkušební chyba skriptu/);
  // Nastavení: položka jde zahodit
  await page.locator('.wbar .link').click();
  await page.locator('button.icon[aria-label="Nastavení"]').click();
  assert.equal(await page.locator('.failed li').count(), 1);
  answer(true);
  await page.getByText('Zahodit položku').click();
  assert.equal(await page.locator('.failed li').count(), 0);
  assert.equal(Object.keys((await phone(page)).queue).length, 0);
});

await scenario('stary-skript', async (go) => {
  const api = makeApi(); api.version = 2;
  const { page } = await go({ api });
  await page.waitForSelector('.notice');
  assert.match(await page.locator('.notice').first().textContent(), /Skript je starší než appka, nasaď ho/);
});

await scenario('spatny-klic', async (go) => {
  const api = makeApi(); api.badKey = true;
  const { page } = await go({ api });
  await page.waitForSelector('input[type=password]');
  assert.equal(await page.locator('h1.small').textContent(), 'Nastavení');
});

await scenario('rutiny', async (go) => {
  const api = makeApi();
  api.data.routines = api.data.routines.concat([
    { row: 12, order: 4, exercise: 'Neznámý cvik', type: 'warmup', kg: 10, reps: 'max' },
  ]);
  const { page } = await go({ api, clock: true });
  await page.waitForSelector('section.card.routine');
  const b = page.locator('section.card.routine', { hasText: 'Silový trénink B' });
  assert.match(await b.locator('.issues').textContent(), /3 problémy v listu Rutiny/);
  await b.locator('.issues').click();
  const list = await page.locator('.issue-list li').allTextContents();
  assert.equal(list.length, 3);
  assert.match(list[0], /Řádek 12.*není v listu Cviky/);
  await page.getByRole('button', { name: 'Zavřít' }).click();
  assert.match(await b.textContent(), /Týden T1/);
  // úsporný zápis: 3 pracovní série dřepu z jednoho řádku
  const a = page.locator('section.card.routine', { hasText: A });
  assert.match(await a.locator('.routine-list').textContent(), /4× Squat \(Barbell\)/);
  // názvy s mezerou a malými písmeny se dohledají v listu Cviky
  await b.getByText('Začít trénink').click();
  await page.waitForSelector('section.card.exercise');
  const sp = card(page, 'Side Plank');
  assert.equal(await sp.count(), 1);
  assert.match(await sp.locator('.set-row.head').textContent(), /ČAS L.*ČAS P/);
  assert.equal(await sp.locator('.watch-ctl').count(), 2);
  const sq = card(page, 'Squat (Barbell)');
  assert.notEqual(await rows(sq).first().locator('.prev').textContent(), '-');
  await rows(sq).first().locator('.check').click();
  await page.waitForFunction(() => document.querySelector('.wbar .pill')?.textContent === 'Uloženo');
  assert.equal(api.data.sets.at(-1).exercise, 'Squat (Barbell)');
  // stopky: lišta nezakryje poslední tlačítko
  await sp.locator('.watch-ctl button').first().click();
  await page.clock.runFor(34000);
  const bar = await page.locator('.watch-bar').evaluate((e) => e.getBoundingClientRect().height);
  const spacer = await page.locator('.spacer').evaluate((e) => e.getBoundingClientRect().height);
  assert.ok(spacer >= bar + 20, `spacer ${spacer} lišta ${bar}`);
  await page.locator('.watch-bar .primary').click();
  await sp.locator('.watch-ctl button').first().click();
  await page.clock.runFor(31000);
  await page.locator('.watch-bar .primary').click();
  assert.deepEqual(await rows(sp).first().locator('.val').evaluateAll((els) => els.map((e) => e.value)), ['0:34', '0:31']);
});

await scenario('novy-cvik', async (go) => {
  const { page, api } = await go({ dark: false });
  await page.waitForSelector('section.card.routine');
  await page.getByText('Prázdný trénink').click();
  await page.getByText('+ Přidat cvik').click();
  await page.locator('.search').fill('Můj nový cvik');
  await page.locator('.pick-list li').last().click();
  await page.locator('select').nth(1).selectOption('2');
  await page.getByText('Založit cvik').click();
  const c = card(page, 'Můj nový cvik');
  await c.waitFor();
  assert.match(await c.locator('.set-row.head').textContent(), /KG \(1 ks\)/);
  await rows(c).first().locator('.f-kg').fill('10');
  await rows(c).first().locator('.f-reps').fill('5');
  await rows(c).first().locator('.check').click();
  assert.match(await c.locator('.set-calc').textContent(), /10 × 2 × 5 = 100 kg/);
  await page.waitForFunction(() => document.querySelector('.wbar .pill')?.textContent === 'Uloženo');
  const ex = api.data.exercises.find((e) => e.name === 'Můj nový cvik');
  assert.equal(ex.dumbbells, 2);
  const order = api.calls.map((x) => x.action).filter((a) => a === 'saveExercise' || a === 'saveWorkout');
  assert.equal(order[0], 'saveExercise');
  // poznámka má písmo 16 px a tlačítka touch-action manipulation
  await c.getByText('+ Poznámka').click();
  assert.equal(await c.locator('textarea.note').evaluate((e) => getComputedStyle(e).fontSize), '16px');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).touchAction), 'manipulation');
});

await scenario('poradi-a-nahrazeni', async (go) => {
  const { page, answer } = await go({ width: 375, height: 700 });
  await startA(page);
  const names = () => page.locator('section.card.exercise .ex-title strong').allTextContents();
  // řádek se na 375 px nezalamuje
  const sq = card(page, 'Squat (Barbell)');
  const tops = await rows(sq).first().locator('> *').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2)));
  assert.ok(Math.max(...tops) - Math.min(...tops) <= 2, 'řádek v jedné lince ' + tops);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'bez vodorovného posunu');
  // Pull Up ze 6. na 2. místo: jedno okno, 3 ťuknutí (superset se posouvá celý)
  await card(page, 'Pull Up').locator('button.icon').click();
  await page.getByText('Změnit pořadí').click();
  const up = page.locator('.reorder li', { hasText: 'Pull Up' }).locator('button[aria-label="Nahoru"]');
  await up.click(); await up.click(); await up.click();
  await page.getByRole('button', { name: 'Hotovo' }).click();
  assert.deepEqual((await names()).slice(0, 3), ['Rowing Machine', 'Pull Up', 'Squat (Barbell)']);
  // nahrazení cviku s potvrzenou sérií
  await rows(sq).nth(0).locator('.check').click();
  await sq.locator('button.icon').click();
  answer(true);
  await page.getByText('Nahradit jen zbývající série').click();
  await page.locator('.search').fill('Skullcrusher');
  await page.locator('.pick-list li').first().click();
  const after = await names();
  assert.deepEqual(after.slice(2, 4), ['Squat (Barbell)', 'Skullcrusher (Dumbbell)']);
  assert.equal(await rows(card(page, 'Squat (Barbell)')).count(), 1);
  assert.equal(await rows(card(page, 'Skullcrusher (Dumbbell)')).count(), 3);
});

await scenario('chyba-vykresleni', async (go) => {
  const { page, context, errors } = await go();
  await page.waitForSelector('section.card.routine');
  await page.evaluate(() => localStorage.setItem('reformer.active', JSON.stringify({ id: 'W-x', title: 'Rozbitý', start: new Date().toISOString(), exercises: null })));
  await page.reload();
  await page.getByText('Něco se pokazilo').waitFor();
  assert.equal(await page.getByText('Načíst znovu').count(), 1);
  assert.ok(await page.evaluate(() => !!localStorage.getItem('reformer.active')));
  errors.length = 0; // chyba je tu záměrná
});

// Obrázek do Stravy: cestou appky (renderImage) proti schváleným náhledům.
// node test/e2e.mjs obrazek --write uloží náhled tréninku bez vah do preview/timed-1080.png
await scenario('obrazek', async (go) => {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const D = new URL('../design/workout-summary-ember/', import.meta.url);
  const { page } = await go();
  await page.waitForSelector('section.card.routine');
  const render = (data) => page.evaluate(async (d) => {
    const m = await import('./js/strava.js');
    const blob = await m.renderImage(d);
    const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
    return String(url).split(',')[1];
  }, data);
  const diff = (a, b) => page.evaluate(async ([x, y]) => {
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + src; });
    const [ia, ib] = await Promise.all([load(x), load(y)]);
    const px = (img) => { const c = document.createElement('canvas'); c.width = 1080; c.height = 1080; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1080, 1080); return g.getImageData(0, 0, 1080, 1080).data; };
    const pa = px(ia); const pb = px(ib);
    let n = 0;
    for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 60) n++;
    return { size: [ia.width, ia.height], pct: n / (1080 * 1080) * 100 };
  }, [a, b]);
  for (const [file, ref] of [['sample-data.json', 'ember-1080.png'], ['edge-case-data.json', 'edge-case-1080.png'], ['timed-data.json', 'timed-1080.png']]) {
    const png = await render(JSON.parse(readFileSync(new URL('template/' + file, D), 'utf8')));
    if (file === 'timed-data.json' && process.argv.includes('--write')) writeFileSync(new URL('preview/' + ref, D), Buffer.from(png, 'base64'));
    const r = await diff(png, readFileSync(new URL('preview/' + ref, D)).toString('base64'));
    assert.deepEqual(r.size, [1080, 1080]);
    assert.ok(r.pct < 2, `${file}: rozdíl ${r.pct.toFixed(2)} % pixelů`);
  }
  // trénink jen z cviků na čas přes buildSummary: žádné "0 kg", délka místo nejtěžší série
  const img = await page.evaluate(async () => {
    const M = await import('./js/model.js'); const S = await import('./js/summary.js');
    const d = await new Promise((res) => { const q = indexedDB.open('reformer', 1); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('bootstrap'); g.onsuccess = () => res(g.result); }; });
    const w = { id: 'T', date: '2030-04-01', start: '2030-04-01T16:00:00.000Z', end: '2030-04-01T16:42:00.000Z', routine: 'Silový trénink D - core (T1)' };
    const set = (i, exercise, order, f) => ({ id: 'T-' + i, workout: 'T', exercise, order, type: f.type || 'normální', ...f });
    const sets = [set(1, 'Rowing Machine', 1, { type: 'rozcvička', km: 2, time: '9:12' }), set(2, 'Side Plank', 2, { time: '0:30', timeR: '0:28' }), set(3, 'Side Plank', 2, { time: '0:34', timeR: '0:31' }), set(4, 'Plank', 3, { time: '1:00' })];
    const one = [set(5, 'Pull Up', 1, { reps: 12 })];
    const model = M.buildModel(d, { T: { op: 'save', workout: w, sets }, U: { op: 'save', workout: { ...w, id: 'U' }, sets: one.map((x) => ({ ...x, workout: 'U' })) } });
    const { body, ...rest } = S.buildSummary(model, 'T').image;
    return { image: rest, desc: S.buildSummary(model, 'T').description, one: S.buildSummary(model, 'U').description };
  });
  assert.deepEqual(img.image.timed, { sets: 4, duration: '42 min' });
  assert.deepEqual(img.image.exercises.map((e) => [e.name, e.text]), [['Rowing Machine', '2 km 9:12'], ['Side Plank', '0:34 / 0:31'], ['Plank', '1:00']]);
  assert.match(img.one, /^Pull Up: 12\n/);
});

stopServer();
let bad = 0;
results.forEach(([name, ok, ms, err]) => {
  console.log(`${ok ? '✔' : '✖'} ${name} (${ms} ms)`);
  if (!ok) { bad++; console.log(err.replace(/^/gm, '    ')); }
});
console.log(`${results.length - bad} z ${results.length} případů prošlo`);
process.exit(bad ? 1 : 0);
