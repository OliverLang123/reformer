# Postup prací

Stav projektu, aby šlo další etapu začít v novém chatu. Zadání a rozhodnutí jsou v SPEC.md a CLAUDE.md (jen lokálně, nejsou v repozitáři). Popis listů tabulky je v README.md.

Termín: v pondělí 9. 11. 2026 odcvičit Silový trénink A v appce. Nutné jsou etapy 0 až 3.

## Plán etap

| Etapa | Obsah | Stav |
| --- | --- | --- |
| 0 | git, .gitignore, README, kostra PWA (ikona, manifest, service worker), GitHub repozitář a Pages | hotovo |
| 1 | Apps Script přes clasp, 9 listů, sloupce ID a vzorec Objem, 34 cviků, rutina A (P2), list Tělo z inbody | hotovo |
| 2 | zápis tréninku jako v Hevy, offline, fronta k odeslání | hotovo |
| 3 | import historie z Hevy skriptem (zkušební běh, pak odeslání) | hotovo |
| 4 | přehledy ze vzorců: Maxima, Objem po týdnech, Poslední trénink, Tento týden | hotovo |
| 5 | souhrn do Stravy: název, popis, obrázek Ember se svalovou mapou | hotovo, čeká test na iPhonu |
| 6 | karty cviků, historie s úpravami, vlastní videa | hotovo, čeká test na iPhonu |
| 7 | úpravy 1: stopky u cviků na čas, váha jedné jednoručky (sloupec Jednoručky), řádek Zápis a výpočet na kartě cviku, oprava historie | hotovo, čeká test na iPhonu |

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
- nic. Oliver v appce zkontroloval (4. 11.): Obnovit data, Historie, MINULE u rutiny A, maximum v detailu cviku.
- Otevřené: cviky „(Weighted)“ z Hevy (Chest Dip, Triceps Dip, Back Extension) mají Zápis váha × opakování, takže se jim do objemu nepočítá tělesná váha.

Ověřeno po importu (3. 11.): selfTest se všemi OK nad 2 738 sériemi, list Série končí řádkem 2739 bez mezer. Podíl tělesné váhy podle Olivera: Chin Up 1, Chest Dip 1, Side Bend 0,2, Netopýr 0,6, Back Extension (Hyperextension) 0,3.

## Etapa 4

Hotovo (4. 11.):
- `apps-script/Overview.js`: vzorce všech čtyř přehledů, každý list má jediný vzorec v A1 (ARRAYFORMULA + LET, MAP/LAMBDA, VSTACK/HSTACK). Sloupce se hledají podle záhlaví. `setup` vzorec zapíše, když chybí nebo A1 nedává očekávané záhlaví, a nastaví formáty. Zástupný text z etapy 1 je pryč.
- Převod do české syntaxe `toSemicolons_` mění čárky na středníky jen mimo text v uvozovkách. Vzorce nepoužívají složené závorky ani desetinná čísla.
- `tools/overview-formulas.mjs` vypíše vzorce v české syntaxi (podle pořadí sloupců ve Schema.js). Tak se zapsaly do tabulky přes konektor, formáty (datum, tisíce, tučné záhlaví) přes batchUpdate.
- Popis řádků a sloupců přehledů je v README.
- Ověřeno proti výpočtu appky (`js/model.js` nad exportem z Hevy): Maxima všech 100 cviků (KG, OPAK., datum) sedí; Objem po týdnech: 82 týdnů, tréninky a série sedí, objem v 81 týdnech, v jednom o 1 kg jinak (zaokrouhlení součtu, který vychází na x,5). Poslední trénink (2. 11., 27 sérií, objem jako v Objemu po týdnech) a Tento týden zkontrolované ručně.
- Poučení: jméno v LET nesmí být adresa buňky (`in7` = buňka IN7 dává #NAME?). V jednom velkém vzorci se pomocná LAMBDA volaná s rozsahem (`at(sloupec)`) a jména jako `rows` chovaly divně (prázdné horní řádky), přímé XLOOKUP fungují.
- Datum u maxima je datum posledního dosažení, stejně jako v detailu cviku v appce.

Zbývá:
- Detail tréninku v Historii (série, objem) appka zatím nemá, patří do etapy 6.
- Otevřené: cviky „(Weighted)“ z Hevy (Chest Dip, Triceps Dip, Back Extension) mají Zápis váha × opakování, takže se jim do objemu nepočítá tělesná váha.

## Etapa 5

Hotovo (4. 11.), verze appky 0.3.0:
- `js/summary.js`: z uloženého tréninku v modelu sestaví název (rutina), popis podle SPEC, ale bez názvu na prvním řádku (Oliver 4. 11., verze 0.3.1) (všechny série, supersety na jednom řádku s „ · “, cviky bez váhy „3×15“, nová maxima, celkem zvednuto · pracovní série · délka) a data pro šablonu (label a title z rutiny, 4 cviky s největším objemem bez cviků na čas, top/previous/isPR, personalRecord mimo vybrané 4, objem jako ve vzorci, svalová mapa podle bodů 1 / 0,5).
- `js/strava.js`: šablona v rámu mimo obrazovku, html-to-image 1.11.13 (`vendor/`) udělá PNG, první snímek se zahodí (Safari). Uložit obrázek = Web Share API se souborem, jinak stažení. Kopírování přes schránku.
- `js/body-map.js`: SVG cesty postavy z react-native-body-highlighter 3.2.0 (`tools/extract-body.mjs`), licence ve `vendor/`.
- Šablona: `data.body` (postava z dat, viewBox se zúží na obrys) a `bodyweight` (vlastní váha). Bez `data.body` se kreslí původní ukázka.
- Obrazovky: Hotovo má sekci Souhrn do Stravy; řádek v Historii otevře souhrn tréninku (obrázek a popis se všemi sériemi, do etapy 6 slouží i jako náhled tréninku).
- Service worker: šablona, fonty (16 souborů woff2) a html-to-image v mezipaměti. Opravená chyba: stránka, která v mezipaměti nebyla, dostala místo sebe úvod appky (i online); teď se úvod vrací jen bez signálu.
- Ověřeno v headless Chromu (Playwright s nainstalovaným Chromem, stažení Chromia pro Playwright tady neprošlo): sample-data a edge-case-data proti `preview/` po pixelech: snímek stránky 0,5 % pixelů jinak, html-to-image 1,4 % (vyhlazení písma, výpustka o písmeno jinde), vzhled shodný. Trénink z 2. 11. z exportu Hevy: popis a objem 9 055 kg sedí s tabulkou, postava nohy hlavní. Celý tok s náhradním API: trénink, Dokončit, Uložit, obrázek, Kopírovat popis. Offline: obrázek se vykreslí bez sítě.

Zbývá:
- Oliver na iPhonu: po Obnovit data ťuknout na trénink v Historii, zkontrolovat obrázek (fonty, postava už v prvním snímku), Uložit obrázek do Fotek, Kopírovat název a popis, a totéž v režimu letadlo.
- Partie mají vyplněné jen cviky ze seznamu 34. Cviky z Hevy bez partií se do svalové mapy nepočítají.

## Etapa 6

Hotovo (4. 11.):
- 0.4.0 Historie: na úvodu odkaz Celá historie (po měsících), detail tréninku (čas, délka, objem, série po cvicích s typy a opakováními v záloze, poznámka, souhrn do Stravy), Upravit a Smazat. Úprava používá obrazovku tréninku (`W.fromSaved`, režim `edit`: bez odpočinku, Wake Lock a dotazu po 3 h, MINULE jen z dřívějších tréninků, poznámka k tréninku dole), do tabulky jde až po Uložit se stejnými ID sérií. Smazání přes frontu (`deleteWorkout`).
- Opravená chyba: po odeslání z fronty trénink zmizel z modelu a appka do Obnovit data ukazovala starý stav. Teď se odeslaná změna zapíše i do dat v telefonu (`applyToCache`, `dataVersion`).
- Karty cviků: na úvodu tlačítko Cviky, seznam s hledáním bez diakritiky (počet tréninků, naposledy), karta cviku s celou historií (po 20 starších).
- 0.5.0 Videa a fotky: `apps-script/Media.js` (`uploadMedia`, `getMedia`, `authorizeDrive`), složka „Reformer média“ vedle tabulky, nové video nebo fotka nahradí staré (staré do koše). Manifest má nově oprávnění `drive`. `js/media.js`: kontrola 20 MB, fotka z prvního snímku (JPEG do 1080 px), nahrání base64, kopie v IndexedDB (`media:<id>`), po Obnovit data se na pozadí stáhnou všechna videa a fotky. Karta cviku: video bez zvuku dokola, jinak fotka, tlačítka Natočit video a Nahrát fotku (iPhone nabídne fotoaparát nebo galerii). V tréninku fotka místo písmene, ťuknutím karta s videem.
- Ověřeno v headless Chromu s náhradním API: historie (úprava 100 × 10 na 100 × 11 v tabulce, smazání), seznam cviků a hledání, nahrání zkušebního videa (webm) a fotky, přehrávání dokola bez zvuku, offline fotka v kartě i video v detailu.
- Oliver spustil `authorizeDrive` a povolil Drive (složka „Reformer média“ založená). Nasazení verze 4 na stejné adrese, GET vrací API verze 2, POST se špatným klíčem vrací „Špatný klíč“.

Zbývá:
- Oliver na iPhonu: nahrání videa (.mov) a přehrávání ověřeno u RDL. Zbývá nové video rovnou s fotkou a offline (režim letadlo). Projít historii, úpravu a smazání (na zkušebním tréninku).
- 0.5.1 (po prvním testu na iPhonu): video RDL se nahrálo, ale fotka z prvního snímku ne (Safari na iPhonu nedekóduje snímek z videa mimo stránku). Teď se video vloží do stránky, krátce spustí (s časovým limitem) a pak se z něj udělá fotka. Když cvik má video a nemá fotku, karta cviku ji při otevření doplní sama. Do té doby karta v tréninku ukazuje snímek z videa. Ověřeno v Chromu i na iPhonu (4. 11.): u RDL se fotka po otevření karty doplnila a je v kartě tréninku.
- Úprava tréninku z historie se drží jen v paměti: když se appka během úpravy zavře, změny se ztratí.

## Etapa 7: úpravy 1 (stopky a jednoručky)

Zadání v UPRAVY-1.md (jen lokálně, má přednost před SPEC.md). Verze appky 0.6.0, skript nasazení verze 5 na stejné adrese.

Hotovo (10. 11.):
- Tabulka: list Cviky má sloupec Jednoručky (K, za Fotkou; 14 cviků 2, 7 cviků 1). Vyplněno dočasným vzorcem podle seznamu názvů a převedeno na hodnoty. Texty v Provedení „Váha je součet ... jednoruček“ u 5 cviků přepsané na „Zapisuje se váha jedné jednoručky“ (Skullcrusher: jedna jednoručka), stejně v `Seed.js`.
- List Série: sloupec ČAS P vložený před Objem (Objem musí zůstat poslední, `writeWidth_`), formát text. `ensureHeaders_` v `setup` teď nové sloupce vkládá před Objem.
- Vzorce s násobkem J: Objem (`volumeFormulaFor_`), Maxima (součet KG × J), Tento týden (nejtěžší série jako součet), Poslední trénink (+ ČAS P a Jednoručky na konci záhlaví). Zapsané přes konektor z `tools/overview-formulas.mjs` (nově vypisuje i vzorec Objem). `setup` přepíše vzorec, když se liší od aktuální verze (`sameFormula_`, bez ohledu na mezery a středníky), ne jen když chybí.
- Appka: `dumbbells` u cviku, `setVolume` × J, maximum s rozpisem („40 kg (2 × 20) × 9“), popis do Stravy „2×20×9“ a „0:34/0:31“, obrázek s váhou jako součtem. Karta cviku: řádek Zápis, „KG (1 ks)“, výpočet pod potvrzenou sérií, Cvik celkem; totéž v detailu tréninku v Historii.
- Stopky: `w.watch` v rozpracovaném tréninku (čas startu, strana, cíl z rutiny), lišta dole místo odpočinku, Start / Start L / Start P v řádku, Stop zapíše čas a u „čas“ / po pravé straně potvrdí sérii, × bez zápisu, Start ukončí odpočinek. ČAS P se ukládá jako `timeR`.
- Oprava historie: obecná akce skriptu `fixSetKg` (`apps-script/Fix.js`) a `tools/fix-kg.mjs`; seznam změn je mimo repozitář (osobní váhy) v `../data/`. Páry teď → nově se přiřazují podle hodnoty, protože ID sérií z appky mají náhodnou část a neřadí se podle pořadí.
- Ověřeno v headless Chromu (Playwright, náhradní API z exportu Hevy s opravou a vymyšlenými tréninky 6. a 10. 11., řízené hodiny): všechny případy z „Jak ověřit“ v appce, včetně stopek (pípnutí v 0:30, Stop L 0:34, Stop P 0:31, uložení ČAS/ČAS P, odpočinek, superset, 20 s „zamčení“, zavření a otevření appky se skutečnými hodinami).

- Oprava historie zapsaná (10. 11., po zkušebním běhu a OK od Olivera): 23 sérií v 7 záznamech, KG / 2, kontrolní čtení všech 23 OK. Klíč zadával Oliver do terminálu (`tools/fix-kg.mjs`).
- Ověřeno v tabulce po opravě: Objem po týdnech 9. 11. a 2. 11. stejný jako před úpravou, starší týdny vyšší; Maxima Incline Bench Press (Dumbbell) 100 × 7 (9. 3. 2026), Hammer Curl (Dumbbell) 30 × 10 (22. 10. 2026), Skullcrusher (Dumbbell) 15 × 6 (9. 7. 2026); objem série BSS 10. 11. 720, Shoulder Press 6. 11. 650, Calf Raise 240; Tento týden nejtěžší série jako součet.

Zbývá:
- Oliver na iPhonu po Obnovit data: stopky (Side Plank sám i v supersetu, pípnutí, zamčený telefon, zavření appky), řádek Zápis a výpočet na kartě BSS, popis do Stravy tréninku z 10. 11.
- Po nasazení přepíše Claude v chatu rutiny v listu Rutiny na váhu jedné jednoručky (Claude Code list Rutiny neupravuje).
- Appka neumí zakládat nové cviky (jen jméno, doplní se v listu Cviky), proto volba Jednoručky v appce není.

## Další krok

Etapy 0 až 7 jsou hotové. Zbývají testy na iPhonu (etapy 5 a 6) a pondělní trénink 9. 11.
