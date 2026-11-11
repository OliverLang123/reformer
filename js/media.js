// Vlastní videa a fotky cviků: nahrání přes skript do Drive, kopie v telefonu (IndexedDB),
// aby se přehrávaly hned a bez signálu. Odkazy jsou v listu Cviky (sloupce Video a Fotka).

import { call, idbGet, idbSet } from './store.js';

export const MAX_BYTES = 8 * 1024 * 1024;
const MIN_FREE = 50 * 1024 * 1024; // pod touto rezervou se média do telefonu nestahují

export const fmtSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
const urls = new Map(); // id souboru -> object URL (v paměti, dokud appka běží)
const pending = new Map(); // id souboru -> probíhající stažení

export function fileId(url) {
  const m = String(url || '').match(/[-\w]{25,}/);
  return m ? m[0] : null;
}

function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Object URL souboru: z paměti, z telefonu, jinak stáhne přes skript a uloží
export async function mediaUrl(id) {
  if (!id) return null;
  if (urls.has(id)) return urls.get(id);
  if (!pending.has(id)) {
    pending.set(id, (async () => {
      let blob = await idbGet('media:' + id).catch(() => null);
      if (!blob) {
        const r = await call('getMedia', { id }, undefined, 120000);
        blob = base64ToBlob(r.data, r.mime);
        await idbSet('media:' + id, blob).catch(() => {});
      }
      const url = URL.createObjectURL(blob);
      urls.set(id, url);
      return url;
    })().finally(() => pending.delete(id)));
  }
  return pending.get(id);
}

// Volné místo v úložišti prohlížeče (null, když ho prohlížeč nesdělí)
async function freeSpace() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const { quota, usage } = await navigator.storage.estimate();
    return quota ? quota - (usage || 0) : null;
  } catch {
    return null;
  }
}

// Na pozadí stáhne do telefonu všechna videa a fotky, které tam ještě nejsou.
// Vrátí 'low', když v telefonu není místo (média se pak nestahují, data tréninků mají přednost).
export async function prefetchMedia(exercises) {
  for (const e of exercises) {
    for (const link of [e.photo, e.video]) {
      const id = fileId(link);
      if (!id || urls.has(id)) continue;
      try {
        if (await idbGet('media:' + id)) continue;
        const free = await freeSpace();
        if (free !== null && free < MIN_FREE) return 'low';
        await mediaUrl(id);
      } catch {
        return 'error'; // bez signálu nebo chyba skriptu: zkusí se při dalším obnovení dat
      }
    }
  }
  return 'ok';
}

// Fotka z prvního snímku videa (JPEG, delší strana nejvýš 1080 px).
// Safari na iPhonu dekóduje snímek jen u videa vloženého do stránky, které se krátce spustí.
export async function posterFromVideo(blob) {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true;
  v.defaultMuted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('muted', '');
  v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:-2000px;top:0;width:160px;height:284px;opacity:0;pointer-events:none;';
  document.body.appendChild(v);
  const once = (ev, ms = 10000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Z videa nejde udělat fotka')), ms);
    v.addEventListener(ev, () => { clearTimeout(t); resolve(); }, { once: true });
    v.addEventListener('error', () => { clearTimeout(t); reject(new Error('Video nejde přehrát')); }, { once: true });
  });
  try {
    const meta = once('loadeddata');
    v.src = url;
    v.load();
    await meta;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    try { await Promise.race([v.play(), wait(1500)]); } catch { /* bez přehrání to někde jde taky */ }
    v.pause();
    const seeked = once('seeked');
    v.currentTime = Math.min(0.1, (v.duration || 1) / 2);
    await seeked;
    await Promise.race([new Promise((r) => v.requestVideoFrameCallback && v.requestVideoFrameCallback(() => r())), wait(300)]);
    if (!v.videoWidth || !v.videoHeight) throw new Error('Z videa nejde udělat fotka');
    const scale = Math.min(1, 1080 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const out = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (!out) throw new Error('Z videa nejde udělat fotka');
    return out;
  } finally {
    v.pause();
    v.removeAttribute('src');
    v.load();
    v.remove();
    URL.revokeObjectURL(url);
  }
}

function ext(file, fallback) {
  const m = String(file.name || '').match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase();
  const t = String(file.type || '').split('/')[1];
  return t ? t.replace('quicktime', 'mov').replace('jpeg', 'jpg') : fallback;
}

async function upload(exercise, kind, blob, extension) {
  const data = await blobToBase64(blob);
  const mime = blob.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg');
  const r = await call('uploadMedia', { exercise, kind, mime, ext: extension, data }, undefined, 300000);
  await idbSet('media:' + r.id, blob).catch(() => {});
  urls.set(r.id, URL.createObjectURL(blob));
  return r.url;
}

// Nové video cviku: nahraje video a fotku z jeho prvního snímku. Vrátí { video, photo } odkazy.
export async function uploadVideo(exercise, file, onStep = () => {}) {
  if (file.size > MAX_BYTES) throw new Error(`Video má ${fmtSize(file.size)}, limit je 8 MB. Natoč kratší (3 až 8 s) ve Full HD, ne ve 4K.`);
  onStep('Připravuji fotku...');
  let poster = null;
  try { poster = await posterFromVideo(file); } catch { /* doplní se při dalším otevření karty */ }
  onStep('Nahrávám video...');
  const video = await upload(exercise, 'video', file, ext(file, 'mp4'));
  let photo = null;
  if (poster) {
    onStep('Nahrávám fotku...');
    photo = await upload(exercise, 'photo', poster, 'jpg');
  }
  return { video, photo };
}

// Fotka z videa, které už je v Drive (když se při nahrání fotka nepovedla)
export async function photoFromSavedVideo(exercise, videoObjectUrl) {
  const blob = await fetch(videoObjectUrl).then((r) => r.blob());
  const poster = await posterFromVideo(blob);
  return { photo: await upload(exercise, 'photo', poster, 'jpg') };
}

export async function uploadPhoto(exercise, file) {
  if (file.size > MAX_BYTES) throw new Error(`Fotka má ${fmtSize(file.size)}, limit je 8 MB.`);
  return { photo: await upload(exercise, 'photo', file, ext(file, 'jpg')) };
}
