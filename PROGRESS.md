# Postup prací

Stav projektu, aby šlo další etapu začít v novém chatu. Zadání a rozhodnutí jsou v SPEC.md a CLAUDE.md (jen lokálně, nejsou v repozitáři). Popis listů tabulky je v README.md.

Termín: v pondělí 9. 11. 2026 odcvičit Silový trénink A v appce. Nutné jsou etapy 0 až 3.

## Plán etap

| Etapa | Obsah | Stav |
| --- | --- | --- |
| 0 | git, .gitignore, README, kostra PWA (ikona, manifest, service worker), GitHub repozitář a Pages | hotovo |
| 1 | Apps Script přes clasp, 9 listů, sloupce ID a vzorec Objem, 34 cviků, rutina A (P2), list Tělo z inbody | hotovo |
| 2 | zápis tréninku jako v Hevy, offline, fronta k odeslání | čeká |
| 3 | import historie z Hevy skriptem (zkušební běh, pak odeslání) | čeká |
| 4 | přehledy ze vzorců: Maxima, Objem po týdnech, Poslední trénink, Tento týden | čeká |
| 5 | souhrn do Stravy: název, popis, obrázek Ember se svalovou mapou | čeká |
| 6 | karty cviků, historie s úpravami, vlastní videa | čeká |

## Technické dohody

- Appka je statický web bez sestavování (čisté ES moduly), GitHub Pages z větve `main`, kořen repozitáře.
- Při každé změně souborů appky zvýšit `CACHE` v `sw.js` a `VERSION` v `app.js`.
- Git identita v repozitáři: `OliverLang123 <OliverLang123@users.noreply.github.com>` (soukromý e-mail se do veřejných commitů nedostane).
- Lokální náhled: `.claude/launch.json` (python3 http.server, port 8765), složka `.claude/` není v repozitáři.
- Ikony generuje `python3 tools/make-icons.py`.
- Tabulka: ID je v CLAUDE.md (jen lokálně), locale cs_CZ, pásmo Europe/Prague. Claude Code ji čte přes Google Sheets konektor.
- Do PROGRESS.md a dalších souborů v repozitáři nepatří osobní čísla (tělesná váha, váhy z tréninků), ID tabulky, ID skriptu ani adresa webové appky skriptu.

## Etapa 0

Hotovo (3. 11.):
- git repozitář (větev `main`), `.gitignore` (SPEC.md, CLAUDE.md, CSV, data, clasp, .claude), README s popisem listů.
- Kostra PWA: `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`, ikony v `icons/`.
- Ověřeno v prohlížeči: service worker uloží soubory appky a stránka se otevře i se zastaveným serverem.

- Oliver nainstaloval Node.js (v26.13.0, npm 11.20.0, v `/usr/local/bin`) a GitHub CLI 2.103.3, přihlášen jako OliverLang123 (scopes gist, read:org, repo, workflow). Instalátor gh nebyl podepsaný, otisk SHA-256 ověřen proti oficiálním checksums.
- Veřejný repozitář https://github.com/OliverLang123/reformer, GitHub Pages z `main`, kořen. Push přes `git push` (gh je přihlášený i pro git).
- Ověřeno: https://oliverlang123.github.io/reformer/ vrací 200, service worker se aktivuje, SPEC.md a CLAUDE.md na webu nejsou (404).

Zbývá:
- nic, test na iPhonu prošel (3. 11.): ikona na ploše, celá obrazovka, otevření v režimu letadlo.

## Etapa 1

Hotovo (3. 11.):
- clasp 3.4.1 ve složce projektu (`npm run push`). Oliver je přihlášený (`npx clasp login`, všechna oprávnění, napoprvé chyběla), Apps Script API zapnuté.
- Skript „Reformer API“ připojený k tabulce (`npx clasp create-script --parentId <ID tabulky> --rootDir apps-script`). Pozor: clasp při vytvoření přepsal `apps-script/appsscript.json` výchozím, vráceno. ID skriptu a nasazení jsou v `.clasp.json` a v CLAUDE.md (jen lokálně).
- `apps-script/`: `Schema.js` (listy, sloupce, klíče JSON), `Setup.js` (setup, formáty, vzorec Objem, selfTest), `Seed.js` (34 cviků), `Code.js` (API: ping, bootstrap, saveWorkout, deleteWorkout).
- Oliver spustil setup a uložil API_KEY do Vlastností skriptu. Tabulka má 9 listů, 34 cviků, „List 1“ je smazaný.
- Vzorec Objem v listu Série. Poučení: konektor zapisuje vzorce v české syntaxi (středníky); parametry LAMBDA nesmí být `c` ani `r`; XLOOKUP s prázdným 4. argumentem vrací prázdno místo #N/A; vzorec počítá jen po poslední řádek s ID, aby nové série nešly až za 1000. řádek. Ověřeno na zkušebních řádcích (pak smazány): váha × opakování, na stranu (× 2), vlastní váha s tělesnou vahou k datu, vlastní váha + zátěž před prvním měřením (platí první měření), vzdálenost a čas (prázdné), neznámý cvik (KG × OPAK.).
- Tělo: dvě měření InBody ze souboru `../inbody/inbody-historie.csv`.
- Rutiny: „Silový trénink A - nohy + core (P2)“, 9 cviků, 29 sérií, supersety 1 (lýtka) a 2 (core). Rozsahy „8-10“ a časy „1:30“ zůstaly jako text.
- Webová appka nasazená (verze 1, přístup kdokoli, běží pod Oliverem). Ověřeno: GET vrací stav, POST bez klíče a se špatným klíčem vrací „Špatný klíč“, CORS funguje z https://oliverlang123.github.io.

Zbývá:
- nic. selfTest prošel (3. 11.): přidání, přepsání existujících sérií, smazání chybějící série, odstranění duplicity v požadavku, objemy a úklid.

## Další krok: etapa 2

Zápis tréninku v appce. Při prvním spuštění appka chce adresu skriptu a klíč (uloží v telefonu). Data z `bootstrap` drží v IndexedDB, rozpracovaný trénink a frontu k odeslání také. Po každé potvrzené sérii odešle `saveWorkout` s celým tréninkem.
