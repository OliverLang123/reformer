# Postup prací

Stav projektu, aby šlo další etapu začít v novém chatu. Zadání a rozhodnutí jsou v SPEC.md a CLAUDE.md (jen lokálně, nejsou v repozitáři). Popis listů tabulky je v README.md.

Termín: v pondělí 9. 11. 2026 odcvičit Silový trénink A v appce. Nutné jsou etapy 0 až 3.

## Plán etap

| Etapa | Obsah | Stav |
| --- | --- | --- |
| 0 | git, .gitignore, README, kostra PWA (ikona, manifest, service worker), GitHub repozitář a Pages | hotovo |
| 1 | Apps Script přes clasp, 9 listů, sloupce ID a vzorec Objem, 34 cviků, rutina A (P2), list Tělo z inbody | hotovo |
| 2 | zápis tréninku jako v Hevy, offline, fronta k odeslání | hotovo |
| 3 | import historie z Hevy skriptem (zkušební běh, pak odeslání) | hotovo, čeká kontrola v appce |
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

## Etapa 2

Hotovo (3. 11.), verze appky 0.2.0:
- Preact + htm přibalené ve `vendor/` (htm 3.1.1), appka bez sestavování.
- Nastavení: adresa skriptu a klíč (localStorage), ověření přes `ping`, stažení dat přes `bootstrap` (IndexedDB), obnovení dat, stav fronty.
- Úvod: rutina na řadě nahoře (A → B → C → A podle posledního tréninku; pozná písmeno z „Silový trénink X“), ostatní rutiny, Prázdný trénink, rozpracovaný trénink, posledních 5 tréninků.
- Trénink: horní lišta (délka, objem, série, Dokončit), název tréninku, poznámka k rutině, karty cviků (anglicky a česky, detail cviku s provedením, maximem a historií, připnutá poznámka trenéra a z rutiny, poznámka ke cviku, odpočinek pro cvik, menu ⋮: nahradit, posunout, superset s dalším, odebrat), tabulka SÉRIE / MINULE / KG / OPAK. / ✓ / ✕ podle způsobu zápisu (+KG u vlastní váhy, ČAS, KM a ČAS), typ série a opakování v záloze v menu série, přidání cviku s hledáním bez diakritiky.
- ✓ bez přepsání převezme šedý cíl z rutiny (u rozsahu horní číslo), jinak MINULE. Čas jde psát jen číslicemi (912 = 9:12).
- MINULE: poslední trénink s cvikem; když v něm nejsou označené rozcvičky (historie z Hevy), páruje se podle pořadí všech sérií, jinak zvlášť rozcvičky a pracovní série.
- Nové maximum (🏆) při ✓: lepší než historie i dřívější série tréninku, první záznam cviku se nepočítá, u cviků na čas se nepočítá.
- Odpočinek: lišta dole (-15 s, +15 s, Přeskočit), v supersetu až po posledním cviku kola, pípnutí a zvýraznění na konci, počítá se z času konce (přežije zavření). Výchozí 2:00.
- Uložení: po každé změně potvrzených sérií se do fronty dá celý trénink (`saveWorkout`), fronta drží poslední stav, odešle se při signálu, při návratu do appky a každých 30 s. Štítek Uloženo / Čeká na odeslání. Zahození tréninku pošle `deleteWorkout`.
- Displej nezhasne (Wake Lock), po 3 hodinách dotaz, jestli trénink skončil, rozpracovaný trénink se po zavření obnoví, tmavý i světlý režim.
- Dokončit: délka, objem, série, nová maxima, upozornění na nepotvrzené série, poznámka k tréninku. Konec tréninku = ťuknutí na Uložit trénink.
- Ověřeno v prohlížeči (mobilní velikost) proti náhradnímu API s vymyšlenými daty: MINULE, objemy (na stranu × 2, vlastní váha, veslo 0), nové maximum, superset bez odpočinku, fronta bez signálu a dopsání po návratu, zahození smaže i v tabulce, obnova po znovunačtení, čas 912 = 9:12.
- Opravená chyba: změny tréninku se dřív počítaly z kopie stavu z dřívějšího vykreslení a úklid doběhlého odpočinku tak přepsal novější údaje (ztratil se čas vesla). Teď `onUpdate` dostává funkci nad aktuálním tréninkem (`activeRef`).

Verze 0.2.1 (3. 11., po prvním testu na iPhonu):
- Čas se doplňuje dvojtečkou už při psaní na numerické klávesnici (`typeTime`: 912 → 9:12). Dřív až po opuštění pole a na iPhonu nešel zadat.
- Stav Uloženo / Čeká na odeslání je v horní liště tréninku (dřív vedle názvu a po posunutí zmizel).
- MINULE u vesla zkrácené (2km 9:12).
- Na iPhonu ověřeno: nastavení se skutečným skriptem, obnova rozpracovaného tréninku po zavření.

Zbývá:
- nic. Na iPhonu ověřeno (3. 11.): čas u vesla, štítek Čeká na odeslání v režimu letadlo, série v tabulce po návratu signálu.
- Neověřeno: pípnutí a Wake Lock při skutečném tréninku.

## Etapa 3

Hotovo (3. 11.):
- Skript: akce `importWorkouts` (hromadné přidání, existující ID tréninku přeskočí i se sériemi, chybějící cviky přidá do Cviky). Převod řádků přes `rowMaker_` (záhlaví se čte jednou, jinak by import trval minuty). Nasazení verze 3 na stejné adrese (`npx clasp update-deployment <ID nasazení>`).
- `tools/import-hevy.mjs`: vlastní parser CSV, čas z exportu jako pražský (správně i přes letní čas), ID `hevy-RRRRMMDD-HHMM`, ID série `<ID tréninku>-001`, `set_type` → Typ, `duration_seconds` → m:ss, supersety z `superset_id` (číslované 1, 2...), Zápis nových cviků odhadnutý z dat (km → vzdálenost a čas, jen čas → čas, bez váhy → vlastní váha, jinak váha × opakování), podíl tělesné váhy 0. Bez `--send` jen zkušební běh. S `--send` se zeptá na adresu a skrytě na klíč, odesílá po 25 trénincích, nejstarší první.
- Oliver spustil import: 179 tréninků, 2 738 sérií, 74 nových cviků. Kontrola přes konektor: poslední trénink 2. 11. má 27 sérií, veslo 9:12, objemy sedí.
- Opravené chyby: (1) v prázdném listu Série vzorec Objem vracel prázdný text v N2 a `getLastRow` ho počítal, import tak začal až od řádku 3; teď se zapisuje za poslední řádek s hodnotou v 1. sloupci (`lastRow_`). Prázdný řádek 2 smazán. (2) Smazání řádku 2 rozbilo vzorec Objem (#REF!), protože rozsahy začínaly buňkou B2; teď `INDEX(sloupec; 2):INDEX(sloupec; last)`.

Zbývá:
- Oliver: v appce Obnovit data, zkontrolovat Historii a MINULE u rutiny A.
- Otevřené: cviky „(Weighted)“ z Hevy (Chest Dip, Triceps Dip, Back Extension) mají Zápis váha × opakování, takže se jim do objemu nepočítá tělesná váha.

Ověřeno po importu (3. 11.): selfTest se všemi OK nad 2 738 sériemi, list Série končí řádkem 2739 bez mezer. Podíl tělesné váhy podle Olivera: Chin Up 1, Chest Dip 1, Side Bend 0,2, Netopýr 0,6, Back Extension (Hyperextension) 0,3.

## Další krok: etapa 4

Přehledy ze vzorců (Maxima, Objem po týdnech, Poslední trénink, Tento týden) v české syntaxi, ověřit proti appce.
