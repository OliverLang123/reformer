# Postup prací

Stav projektu, aby šlo další etapu začít v novém chatu. Zadání a rozhodnutí jsou v SPEC.md a CLAUDE.md (jen lokálně, nejsou v repozitáři). Popis listů tabulky je v README.md.

Termín: v pondělí 9. 11. 2026 odcvičit Silový trénink A v appce. Nutné jsou etapy 0 až 3.

## Plán etap

| Etapa | Obsah | Stav |
| --- | --- | --- |
| 0 | git, .gitignore, README, kostra PWA (ikona, manifest, service worker), GitHub repozitář a Pages | rozpracováno |
| 1 | Apps Script přes clasp, 9 listů, sloupce ID a vzorec Objem, 34 cviků, rutina A (P2), list Tělo z inbody | čeká |
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
- Tabulka: ID `1y21kyAPXju6Icrp3mxAjsR8JGUzNsXzV7VtPzWkrUqU`, soubor se jmenuje „Reformer 1.0“, zatím jen „List 1“, locale cs_CZ, pásmo Etc/GMT (skript přepne na Europe/Prague). Claude Code ji čte přes Google Sheets konektor.

## Etapa 0

Hotovo (3. 11.):
- git repozitář (větev `main`), `.gitignore` (SPEC.md, CLAUDE.md, CSV, data, clasp, .claude), README s popisem listů.
- Kostra PWA: `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`, ikony v `icons/`.
- Ověřeno v prohlížeči: service worker uloží soubory appky a stránka se otevře i se zastaveným serverem.

Zbývá:
- Oliver: nainstalovat Node.js a GitHub CLI, přihlásit `gh auth login`.
- Claude Code: `gh repo create reformer --public`, push, zapnout Pages (větev `main`, kořen), ověřit adresu.
- Oliver: na iPhonu otevřít https://oliverlang123.github.io/reformer/ v Safari, Sdílet → Přidat na plochu, otevřít ikonou a zkusit v režimu letadlo.
