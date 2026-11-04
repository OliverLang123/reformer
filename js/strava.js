// Obrázek do Stravy a sdílení: šablona design/workout-summary-ember se vykreslí ve skrytém rámu
// a html-to-image z ní udělá PNG 1080 × 1080. Fonty jsou součástí appky (service worker je má
// v mezipaměti), takže to jde i offline.

const TEMPLATE = 'design/workout-summary-ember/template/summary.html';
const LIB = '../../../vendor/html-to-image.js'; // relativně k šabloně
const SIZE = 1080;

function loadFrame() {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    // Mimo obrazovku, ne skrytý: html-to-image by skrytý obsah nevykreslil
    frame.style.cssText = `position:fixed;left:-${SIZE * 3}px;top:0;width:${SIZE}px;height:${SIZE}px;border:0;pointer-events:none;`;
    frame.onload = () => resolve(frame);
    frame.onerror = () => reject(new Error('Šablona obrázku se nenačetla'));
    frame.src = TEMPLATE;
    document.body.appendChild(frame);
  });
}

function loadScript(doc, src) {
  return new Promise((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Knihovna pro obrázek se nenačetla'));
    doc.head.appendChild(s);
  });
}

// PNG (Blob) z dat pro šablonu
export async function renderImage(data) {
  const frame = await loadFrame();
  try {
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    if (typeof win.renderSummary !== 'function') throw new Error('Šablona obrázku se nenačetla');
    await loadScript(doc, LIB);
    doc.body.removeAttribute('data-ready');
    await win.renderSummary(data);
    const card = doc.getElementById('card');
    const opts = { width: SIZE, height: SIZE, pixelRatio: 1, backgroundColor: '#0B0C0E' };
    // Safari někdy v prvním snímku nemá fonty nebo postavu: první snímek se zahodí
    await win.htmlToImage.toBlob(card, opts);
    const blob = await win.htmlToImage.toBlob(card, opts);
    if (!blob) throw new Error('Obrázek se nepodařilo vytvořit');
    return blob;
  } finally {
    frame.remove();
  }
}

// Uložení obrázku: share sheet (Uložit obrázek do Fotek), jinak stažení souboru
export async function shareImage(blob, fileName) {
  const file = new File([blob], fileName, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      // jinak zkusit stažení
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
