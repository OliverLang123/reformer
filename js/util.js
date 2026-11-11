// Drobné pomocné funkce: čísla s desetinnou čárkou, časy m:ss, ID, hledání bez diakritiky.

const nf = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });

// "82,5" / "82.5" / 82.5 -> 82.5; prázdné nebo nesmysl -> null
export function parseNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Cíl z rutiny: "8-10" -> { lo: 8, hi: 10 }, "10" -> { lo: 10, hi: 10 }
export function parseRange(v) {
  if (v === null || v === undefined || v === '') return null;
  const m = String(v).replace(/\s/g, '').match(/^(\d+(?:[.,]\d+)?)(?:[-–](\d+(?:[.,]\d+)?))?$/);
  if (!m) return null;
  const lo = parseNum(m[1]);
  const hi = m[2] ? parseNum(m[2]) : lo;
  return { lo, hi, text: m[2] ? `${fmtNum(lo)}-${fmtNum(hi)}` : fmtNum(lo) };
}

export function fmtNum(n) {
  return n === null || n === undefined ? '' : nf.format(n);
}

export function fmtInt(n) {
  return nf0.format(Math.round(n || 0));
}

// Buňka tabulky formátovaná jako čas: tabulka čte "2:00" jako 2 hodiny. Trenér tím myslí
// minuty a sekundy, proto se h:mm bez sekund bere jako m:ss ("0:02:00" i "2:00" = 120 s).
function fromDayClock(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 && s === 0 ? h * 60 + m : h * 3600 + m * 60 + s;
}

// Půlnoc nultého dne tabulky (30. 12. 1899) v pásmu Europe/Prague
const SHEET_EPOCH = Date.UTC(1899, 11, 29, 23, 0, 0);

// Čas: "1:30" -> 90, "90" (sekundy z tabulky) -> 90, 90 -> 90.
// Z buňky formátované jako čas přijde zlomek dne (0,0625) nebo datum z roku 1899.
export function parseTime(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0) return null;
    return v > 0 && v < 1 ? fromDayClock(Math.round(v * 86400)) : Math.round(v);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const secs = Math.round((Date.parse(s) - SHEET_EPOCH) / 1000);
    return secs >= 0 && secs < 86400 ? fromDayClock(secs) : null;
  }
  if (!/^\d+(:\d{1,2}){0,2}$/.test(s)) return null;
  const parts = s.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// Číslice z numerické klávesnice: "130" -> 90 s (1:30), "45" -> 45 s, "1:30" -> 90 s
export function parseTimeInput(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (s.includes(':')) return parseTime(s);
  const d = s.replace(/\D/g, '');
  if (!d) return null;
  if (d.length <= 2) return parseInt(d, 10);
  return parseInt(d.slice(0, -2), 10) * 60 + parseInt(d.slice(-2), 10);
}

// Během psaní na numerické klávesnici (bez dvojtečky): "9" -> "9", "912" -> "9:12", "10512" -> "1:05:12".
// Nuly na začátku se zahodí ("075" -> "75"), aby nevzniklo "0:75".
export function typeTime(v) {
  const d = String(v || '').replace(/\D/g, '').replace(/^0+(?=\d{2})/, '').slice(0, 6);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, -2)}:${d.slice(-2)}`;
  return `${d.slice(0, -4)}:${d.slice(-4, -2)}:${d.slice(-2)}`;
}

export function fmtTime(sec) {
  if (sec === null || sec === undefined) return '';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

// Délka tréninku: "1:28 h" nebo "42 min"
export function fmtDuration(ms) {
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} h`;
}

export function uid(prefix) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${rnd}`;
}

// Datum RRRR-MM-DD v pásmu Europe/Prague. Datum tréninku nesmí záviset na pásmu telefonu,
// tabulka i skript počítají v pražském čase.
const pragueFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' });
export function pragueDate(d = new Date()) {
  const p = {};
  pragueFmt.formatToParts(new Date(d)).forEach((x) => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}`;
}

// Během psaní do pole KG nebo OPAK.: jen číslice a jedna desetinná čárka (tečka se převede)
export function typeNum(v) {
  const s = String(v || '').replace(/\./g, ',').replace(/[^\d,]/g, '');
  const i = s.indexOf(',');
  return i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, '');
}

// Klíč pro hledání názvu cviku: bez diakritiky, malá písmena, jedna mezera mezi slovy
export function nameKey(s) {
  return norm(s).replace(/\s+/g, ' ').trim();
}

export function fmtDate(iso) {
  if (!iso) return '';
  const p = String(iso).slice(0, 10).split('-').map(Number);
  return `${p[2]}. ${p[1]}. ${p[0]}`;
}

export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function plural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}
