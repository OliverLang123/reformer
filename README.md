# Reformer

Osobní webová appka (PWA) na zápis silového tréninku. Běží na GitHub Pages bez serveru, data ukládá do tabulky Google Sheets přes Google Apps Script chráněný tajným klíčem. Funguje offline.

Adresa: https://oliverlang123.github.io/reformer/

V repozitáři není žádný klíč, adresa skriptu ani osobní data. Adresu skriptu a klíč zadává uživatel v appce při prvním spuštění; klíč ve skriptu je ve Script Properties.

## Struktura

| Cesta | Co to je |
| --- | --- |
| `index.html`, `app.js`, `styles.css` | appka (obrazovky v Preact + htm, bez sestavování) |
| `js/util.js` | čísla s desetinnou čárkou, časy m:ss, ID |
| `js/store.js` | ukládání v telefonu (localStorage, IndexedDB), volání skriptu, fronta k odeslání |
| `js/model.js` | rutiny, MINULE, maxima, objem, tělesná váha (stejná pravidla jako vzorec Objem) |
| `js/workout.js` | rozpracovaný trénink: série, supersety, odpočinek, stopky, nové maximum, podklad pro tabulku |
| `js/summary.js` | souhrn do Stravy: název, popis a data pro obrázek (výběr cviků, vs. minule, maxima, svalová mapa) |
| `js/strava.js` | obrázek PNG ze šablony (skrytý rám + html-to-image), sdílení, kopírování |
| `js/media.js` | vlastní videa a fotky cviků: nahrání přes skript, fotka z prvního snímku videa, kopie v telefonu |
| `js/body-map.js` | SVG cesty postavy z react-native-body-highlighter (generuje `tools/extract-body.mjs`) |
| `vendor/` | přibalené knihovny (viz `vendor/README.md`) |
| `sw.js` | service worker (offline) |
| `manifest.webmanifest`, `icons/` | instalace na plochu |
| `design/workout-summary-ember/` | předloha obrázku do Stravy (šablona, fonty OFL, náhledy s ukázkovými čísly); appka kreslí obrázek přímo touto šablonou |
| `apps-script/` | Google Apps Script u tabulky: založení listů (`setup`), výchozí cviky, API pro appku, `selfTest` |
| `tools/` | pomocné skripty pro vývoj (`overview-formulas.mjs` vypíše vzorce přehledů a Objemu v české syntaxi, `fix-kg.mjs` hromadná oprava KG podle seznamu) |

## Apps Script

Skript je připojený k tabulce a nahrává se přes [clasp](https://github.com/google/clasp) (`.clasp.json` s ID skriptu není v repozitáři).

- `npm run push` nahraje kód, `npx clasp update-deployment <ID nasazení>` nasadí novou verzi webové appky na stejnou adresu.
- `setup` (spouští se v editoru) založí listy, formáty, vzorec Objem a výchozí cviky. Jde pustit opakovaně, nic nepřepíše.
- Klíč je ve Vlastnostech skriptu pod názvem `API_KEY`.
- Videa a fotky potřebují přístup k Drive: po prvním nahrání skriptu s `Media.js` spustit v editoru `authorizeDrive` a povolit oprávnění, teprve pak nasadit novou verzi.

API: `POST` na adresu webové appky, tělo JSON jako `text/plain` (bez předběžného dotazu CORS): `{ "key": "...", "action": "...", ... }`. Odpověď `{ "ok": true, ... }` nebo `{ "ok": false, "error": "..." }`.

| Akce | Parametry | Vrací |
| --- | --- | --- |
| `ping` | | verze API a název tabulky |
| `bootstrap` | | `exercises`, `routines`, `body`, `workouts`, `sets` (klíče podle `apps-script/Schema.js`) |
| `saveWorkout` | `workout`, `sets` | uloží trénink a jeho série podle ID; série tréninku, které v požadavku chybí, smaže; opakování nic nezdvojí |
| `deleteWorkout` | `id` | smaže trénink a jeho série |
| `uploadMedia` | `exercise`, `kind` (`video` / `photo`), `mime`, `ext`, `data` (base64, nejvýš 20 MB) | uloží soubor do složky „Reformer média“ vedle tabulky, odkaz zapíše do sloupce Video / Fotka v listu Cviky, starý soubor dá do koše |
| `getMedia` | `id` | `mime`, `data` (base64); jen soubory ze složky „Reformer média“ |
| `fixSetKg` | `changes` (`[{ workout, exercise, from, to }]`), `write` | oprava KG v listu Série podle přesného seznamu; zkontroluje počet sérií a současné KG, při rozdílu nezapíše nic; bez `write` jen zkušební běh |

Data a časy jdou v ISO 8601, pole `date` jako `RRRR-MM-DD`, `time`, `timeR` a `rest` jako text `m:ss`.

## Tabulka

Názvy listů a sloupců se nemění, podle nich se v tabulce orientuje appka, skript i Claude v chatu (Google Sheets konektor). Formát čísel a dat je český, časové pásmo Europe/Prague. První řádek každého listu je záhlaví.

### Cviky (jeden řádek = jeden cvik)

| Sloupec | Obsah |
| --- | --- |
| Název | hlavní anglický název, např. `Squat (Barbell)`; podle něj se cviky párují s historií |
| Česky | český název |
| Zápis | `váha × opakování`, `na stranu`, `vlastní váha`, `čas`, `čas na stranu`, `vzdálenost a čas` |
| Partie hlavní | názvy svalů oddělené čárkou: chest, abs, obliques, biceps, triceps, forearm, deltoids, trapezius, upper-back, lower-back, gluteal, quadriceps, hamstring, adductors, calves, tibialis, neck |
| Partie vedlejší | totéž |
| Podíl tělesné váhy | 0 až 1, kolik tělesné váhy se počítá do objemu u cviků s vlastní vahou |
| Provedení | 3 až 5 krátkých bodů, každý na vlastním řádku buňky |
| Pokyny trenéra | osobní pokyny, v tréninku jako připnutá poznámka |
| Video | odkaz na video v Drive (zapisuje appka, soubor ve složce „Reformer média“) |
| Fotka | odkaz na fotku v Drive (z prvního snímku videa nebo nahraná zvlášť) |
| Jednoručky | `2` = dvě jednoručky, v KG je váha jedné a do výpočtů se násobí × 2; `1` = jedna jednoručka, v KG je její váha; prázdné = nejde o jednoručky (osa, stroje včetně Iso-Lateral, kladky), v KG je celková váha |

Násobek J = 2 u Jednoručky = 2, jinak 1. Používá se v Objemu, maximech, Tento týden, popisu a obrázku do Stravy.

### Rutiny (jeden řádek = jedna plánovaná série)

Obsahuje jen aktuální týden, trenér list přepíše.

Pravidlo pro Clauda v chatu: u cviků s Jednoručky = 2 nebo 1 se do KG píše váha jedné jednoručky (Bulgarian Split Squat 20, ne 40).

| Sloupec | Obsah |
| --- | --- |
| Rutina | např. `Silový trénink A - nohy + core (P2)` |
| Týden | např. `P2` |
| Poznámka k rutině | stačí v prvním řádku rutiny |
| Pořadí | pořadí cviku v rutině (1, 2, 3...) |
| Cvik | Název z listu Cviky |
| Superset | stejné číslo = stejný superset, prázdné = bez supersetu |
| Typ | `rozcvička`, `normální`, `do selhání`, `drop` |
| KG | cílová váha; u jednoruček váha jedné jednoručky (tak, jak se zapisuje v appce) |
| OPAK. | cílová opakování, číslo nebo rozsah `8-10` |
| ČAS | `0:30` |
| KM | vzdálenost |
| Odpočinek | `2:00`, prázdné = 2:00 |
| Poznámka | poznámka ke cviku |

### Tréninky (jeden řádek = jeden trénink)

ID, Datum, Začátek, Konec, Rutina, Poznámka

### Série (jeden řádek = jedna odcvičená série)

| Sloupec | Obsah |
| --- | --- |
| ID | ID série |
| Trénink | ID tréninku z listu Tréninky |
| Cvik | Název z listu Cviky |
| Pořadí | pořadí cviku v tréninku |
| Superset | jako v Rutinách |
| Typ | `rozcvička`, `normální`, `do selhání`, `drop` |
| KG, OPAK., ČAS, KM | hodnoty podle způsobu zápisu; u cviků na stranu hodnota pro jednu stranu; u jednoruček váha jedné jednoručky; u zápisu `čas na stranu` je v ČAS levá strana |
| V záloze | opakování v záloze 0 až 4, volitelné |
| Poznámka ke cviku | poznámka ke cviku v tomto tréninku |
| Potvrzeno | čas potvrzení série |
| ČAS P | čas pravé strany u zápisu `čas na stranu`, jinak prázdné (historie z Hevy ho nemá) |
| Objem | jen vzorec, musí být poslední sloupec: KG × J × OPAK., u cviků na stranu × 2, u vlastní váhy (tělesná váha × podíl + KG × J) × OPAK. |

### Tělo (jeden řádek = jedno měření)

Datum, Váha, Zdroj (`InBody`, `váha`, `chat`). Zapisuje Claude v chatu.

### Přehledy (jen vzorce)

Každý list má jediný vzorec v buňce A1 (`apps-script/Overview.js`), který vypíše celou tabulku i se záhlavím. Do těchto listů se nepíše. Když vzorec chybí nebo hlásí chybu, `setup` ho zapíše znovu.

**Poslední trénink** (pro Claude v chatu po tréninku). Poslední trénink podle začátku.

| Řádek | Obsah |
| --- | --- |
| 1 až 5 | Datum, Rutina, Začátek a Konec, Objem kg a počet sérií (Sérií, Pracovních = bez rozcviček), Poznámka k tréninku |
| 7 | záhlaví: Cvik, Pořadí, Superset, Typ, KG, OPAK., ČAS, KM, V záloze, Poznámka ke cviku, ČAS P, Jednoručky (KG je tak, jak je zapsané, tedy u Jednoručky = 2 váha jedné) |
| 8 a dál | série v pořadí cviků |

**Tento týden** (pro týdenní hodnocení). Posledních 7 dní včetně dneška.

| Řádek | Obsah |
| --- | --- |
| 1 | Od, Do |
| 2 | součet: Tréninků, Sérií, Objem kg |
| 4 | záhlaví: Cvik, Tréninků, Sérií, Nejtěžší série, Celkem zvednuto |
| 5 a dál | cviky v pořadí, jak byly odcvičené |

Nejtěžší série je bez rozcviček, váha jako součet KG × J (dvě jednoručky po 20: `40 kg × 9`): `100 kg × 10`, u vlastní váhy `+10 kg × 8` nebo `14 opak.`, u cviků na čas všechny časy (`2 km 9:12`).

**Maxima:** Cvik, Česky, KG, OPAK., Datum, Zápis. KG je součet KG × J. Stejné pravidlo jako appka: jen pracovní série, největší váha, při shodě víc opakování, datum posledního dosažení. U vlastní váhy je KG přidaná zátěž. Cviky na čas a vzdálenost nemají maximum.

**Objem po týdnech:** Týden od (pondělí), Tréninků, Sérií, Pracovních sérií, Objem kg. Nejnovější týden nahoře. Objem a Sérií včetně rozcviček, ze sloupce Objem v listu Série.

Vzorce v tabulce jsou v české syntaxi (oddělovač středník).

## Souhrn do Stravy

Appka se Stravou nekomunikuje. Po uložení tréninku (a po ťuknutí na trénink v Historii) ukáže obrázek 1080 × 1080, název a popis s tlačítky Kopírovat název, Kopírovat popis a Uložit obrázek (share sheet, jinak stažení `reformer-RRRR-MM-DD.png`).

Šablona `design/workout-summary-ember/template/summary.html` je proti předloze upravená jen ve dvou věcech:
- `data.body` = `{ front: { viewBox, parts: [{ d, tone }] }, back: ... }` nakreslí postavu z dat (tone: primary, secondary, tertiary, inactive, inactive-alt, head). Bez `data.body` zůstane ukázková mapa, takže samostatný náhled funguje dál.
- `bodyweight: true` u cviku: místo „0 kg × 12“ ukáže „vlastní váha × 12“, s přidanou zátěží „+10 kg × 8“.

Kontrola na Macu: `npm i` a `node design/workout-summary-ember/render/render.cjs <data.json> out.png` (Playwright, potřebuje `npx playwright install chromium`).

## Licence třetích stran

Fonty Unbounded, Inter Tight a JetBrains Mono: SIL Open Font License 1.1 (`design/workout-summary-ember/fonts/`).
html-to-image a SVG cesty z react-native-body-highlighter: MIT (`vendor/`, viz `vendor/README.md`).
