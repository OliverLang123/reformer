# Reformer

Osobní webová appka (PWA) na zápis silového tréninku. Běží na GitHub Pages bez serveru, data ukládá do tabulky Google Sheets přes Google Apps Script chráněný tajným klíčem. Funguje offline.

Adresa: https://oliverlang123.github.io/reformer/

V repozitáři není žádný klíč, adresa skriptu ani osobní data. Adresu skriptu a klíč zadává uživatel v appce při prvním spuštění; klíč ve skriptu je ve Script Properties.

## Struktura

| Cesta | Co to je |
| --- | --- |
| `index.html`, `app.js`, `styles.css` | appka |
| `sw.js` | service worker (offline) |
| `manifest.webmanifest`, `icons/` | instalace na plochu |
| `design/workout-summary-ember/` | předloha obrázku do Stravy (šablona, fonty OFL, náhledy s ukázkovými čísly) |
| `tools/` | pomocné skripty pro vývoj |

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
| Video | odkaz na video v Drive |
| Fotka | odkaz na fotku v Drive |

### Rutiny (jeden řádek = jedna plánovaná série)

Obsahuje jen aktuální týden, trenér list přepíše.

| Sloupec | Obsah |
| --- | --- |
| Rutina | např. `Silový trénink A - nohy + core (P2)` |
| Týden | např. `P2` |
| Poznámka k rutině | stačí v prvním řádku rutiny |
| Pořadí | pořadí cviku v rutině (1, 2, 3...) |
| Cvik | Název z listu Cviky |
| Superset | stejné číslo = stejný superset, prázdné = bez supersetu |
| Typ | `rozcvička`, `normální`, `do selhání`, `drop` |
| KG | cílová váha |
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
| KG, OPAK., ČAS, KM | hodnoty podle způsobu zápisu; u cviků na stranu hodnota pro jednu stranu |
| V záloze | opakování v záloze 0 až 4, volitelné |
| Poznámka ke cviku | poznámka ke cviku v tomto tréninku |
| Potvrzeno | čas potvrzení série |
| Objem | jen vzorec: KG × OPAK., u cviků na stranu × 2, u vlastní váhy tělesná váha × podíl + přidaná zátěž |

### Tělo (jeden řádek = jedno měření)

Datum, Váha, Zdroj (`InBody`, `váha`, `chat`). Zapisuje Claude v chatu.

### Přehledy (jen vzorce)

- **Maxima:** pro každý cvik nejtěžší váha, počet opakování a datum.
- **Objem po týdnech:** celkem zvednuto a počet sérií za týden.
- **Poslední trénink:** série posledního tréninku, nahoře poznámka k tréninku.
- **Tento týden:** souhrn po cvicích za posledních 7 dní, nahoře součet.

Podrobnosti listů se upřesní v etapě 1 (viz PROGRESS.md).

## Licence třetích stran

Fonty Unbounded, Inter Tight a JetBrains Mono: SIL Open Font License 1.1 (`design/workout-summary-ember/fonts/`).
