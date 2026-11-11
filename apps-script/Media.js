// Vlastní videa a fotky cviků. Soubory jsou v Drive ve složce „Reformer média“ vedle tabulky,
// nesdílejí se. Appka je nahrává a stahuje přes tento skript (base64 v JSON), odkaz se zapíše
// do listu Cviky (sloupce Video a Fotka). Nové video nebo fotka nahradí staré (staré jde do koše).

const MEDIA_FOLDER = 'Reformer média';
const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
const MEDIA_COLUMN = { video: 'Video', photo: 'Fotka' };

function mediaFolder_() {
  const file = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
  const parents = file.getParents();
  const parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const found = parent.getFoldersByName(MEDIA_FOLDER);
  return found.hasNext() ? found.next() : parent.createFolder(MEDIA_FOLDER);
}

function fileIdFromUrl_(url) {
  const m = String(url || '').match(/[-\w]{25,}/);
  return m ? m[0] : null;
}

function inFolder_(file, folder) {
  const parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folder.getId()) return true;
  return false;
}

// req: { exercise, kind: 'video' | 'photo', mime, ext, data (base64) }
function uploadMedia_(req) {
  const column = MEDIA_COLUMN[req.kind];
  if (!column) throw fail_('bad_request', 'Neznámý druh souboru: ' + req.kind);
  if (!req.exercise) throw fail_('bad_request', 'Chybí cvik');
  // Jen videa a fotky (video do sloupce Video, obrázek do sloupce Fotka)
  const mime = String(req.mime || '');
  if (mime.indexOf(req.kind === 'video' ? 'video/' : 'image/') !== 0) throw fail_('bad_request', 'Soubor není ' + (req.kind === 'video' ? 'video' : 'obrázek'));
  const bytes = Utilities.base64Decode(String(req.data || ''));
  if (!bytes.length) throw fail_('bad_request', 'Prázdný soubor');
  if (bytes.length > MEDIA_MAX_BYTES) throw fail_('bad_request', 'Soubor je větší než 8 MB');

  const folder = mediaFolder_();
  const ext = String(req.ext || (req.kind === 'video' ? 'mp4' : 'jpg')).replace(/[^a-z0-9]/gi, '').slice(0, 5);
  const name = String(req.exercise).replace(/[\\/:*?"<>|]/g, '-') + ' - ' + (req.kind === 'video' ? 'video' : 'fotka') + '.' + ext;
  const file = folder.createFile(Utilities.newBlob(bytes, mime, name));
  const url = 'https://drive.google.com/file/d/' + file.getId() + '/view';

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = sheet_('Cviky');
    const h = headerIndex_(sh);
    if (h[column] === undefined) throw new Error('V listu Cviky chybí sloupec ' + column);
    const last = sh.getLastRow();
    const names = last > 1 ? sh.getRange(2, h['Název'] + 1, last - 1, 1).getValues().map((r) => String(r[0])) : [];
    let row = names.indexOf(String(req.exercise)) + 2;
    if (row < 2) {
      appendRows_(sh, [rowMaker_(sh)({ name: req.exercise })]);
      row = lastRow_(sh);
    }
    const cell = sh.getRange(row, h[column] + 1);
    const oldId = fileIdFromUrl_(cell.getValue());
    cell.setValue(url);
    if (oldId && oldId !== file.getId()) {
      try {
        const old = DriveApp.getFileById(oldId);
        if (inFolder_(old, folder)) old.setTrashed(true);
      } catch (e) { /* starý soubor už neexistuje */ }
    }
  } finally {
    lock.releaseLock();
  }
  return { id: file.getId(), url: url, kind: req.kind };
}

// req: { id } -> { mime, data (base64) }. Jen soubory ze složky médií.
function getMedia_(req) {
  const file = DriveApp.getFileById(String(req.id || ''));
  if (!inFolder_(file, mediaFolder_())) throw new Error('Soubor není ve složce ' + MEDIA_FOLDER);
  const blob = file.getBlob();
  return { id: file.getId(), mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

// Spusť jednou v editoru po přidání médií: vyžádá oprávnění k Drive a založí složku.
function authorizeDrive() {
  const folder = mediaFolder_();
  const msg = 'Složka pro videa: ' + folder.getName() + ' (' + folder.getUrl() + ')';
  Logger.log(msg);
  return msg;
}
