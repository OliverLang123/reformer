# Sumář tréninku pro Stravu - design „Volt / Ember“

Podklad pro Claude Code: obrázek 1080 × 1080 PNG, který appka vygeneruje po dokončení silového tréninku a uživatel ho nahraje na Stravu.
Design je schválený, implementace má odpovídat náhledu `preview/ember-1080.png` pixel na pixel (u ukázkových dat).

## Obsah balíčku

| Cesta | Co to je |
|---|---|
| `template/summary.html` | Referenční implementace. Samostatná HTML šablona, vykreslí se z JSON dat přes `window.renderSummary(data)`. Otevři ji v prohlížeči a uvidíš ukázku. |
| `template/sample-data.json` | Ukázková data (trénink A, nohy + core), z nich je `preview/ember-1080.png`. |
| `template/edge-case-data.json` | Okrajové případy (dlouhé názvy, pokles výkonu, nový cvik, bez rekordu, šesticiferný objem, 1 série), z nich je `preview/edge-case-1080.png`. |
| `tokens.json` | Design tokeny: barvy, písma, velikosti, rozměry dlaždic. |
| `fonts/` | Self-hosted fonty Unbounded, Inter Tight, JetBrains Mono (woff2, latin + latin-ext kvůli češtině) + `fonts.css` + licence OFL. |
| `assets/body-front.svg`, `assets/body-back.svg` | Svalová mapa zepředu a zezadu, vrstvy podle intenzity (viz níže). |
| `render/render.cjs` | Referenční renderer JSON -> PNG přes Playwright (headless Chromium). |
| `preview/` | Očekávané výstupy pro porovnání. |

## Co implementovat

1. Napoj šablonu na data z appky (datový kontrakt níže).
2. Vyber způsob renderu do PNG podle stacku appky (možnosti níže). Výstup: PNG 1080 × 1080, sRGB.
3. Nahraď ukázkovou svalovou mapu vlastní mapou appky (sekce Svalová mapa).
4. Přidej sdílení / uložení PNG (share sheet, uložit do galerie), aby šel obrázek nahrát na Stravu.
5. Ověř výstup proti oběma náhledům v `preview/`.

## Datový kontrakt

```json
{
  "label": "Silový trénink A",
  "title": "Nohy + core",
  "date": "2026-11-09",
  "totalVolumeKg": 9870,
  "workingSets": 24,
  "theme": { "accent": "#FF6A2B" },
  "exercises": [
    {
      "name": "Romanian Deadlift",
      "equipment": "Barbell",
      "top": { "weightKg": 50, "reps": 10 },
      "previous": { "weightKg": 30, "reps": 10 },
      "isPR": true
    }
  ],
  "personalRecord": null
}
```

- `label`: krátký název tréninku do pilulky vlevo nahoře (zobrazuje se velkými písmeny).
- `title`: hlavní nadpis. Každý znak `+` se obarví akcentem.
- `date`: `YYYY-MM-DD`, parsovat jako lokální datum (ne UTC), jinak se v jiném časovém pásmu posune den.
- `totalVolumeKg`: součet váha × opakování za všechny pracovní série.
- `workingSets`: počet pracovních sérií (bez rozcvičovacích).
- `exercises[].top`: nejlepší (top) série cviku v tomto tréninku. `previous`: top série téhož cviku z minulého tréninku, chybí-li, cvik je nový.
- `isPR`: cvik má v tomto tréninku osobní maximum.
- `personalRecord` (volitelné): vynutí konkrétní cvik do dlaždice rekordu, jinak se vezme první cvik s `isPR`.

## Pravidla zobrazení

**Cviky:** max. 4 řádky, pořadí podle tréninku. Když jich je víc, appka má poslat 4 „hlavní“ (např. podle objemu nebo podle toho, co uživatel označil). Dlouhý název se zkrátí výpustkou. U PR cviku je za názvem štítek `MAX`.

**Štítek „vs. minule“** (na pravé straně řádku), priorita váha, pak opakování:

| Situace | Text | Styl |
|---|---|---|
| vyšší váha | `↑ +20 kg` | akcent na tmavém akcentu (`--accent-chip`) |
| stejná váha, víc opakování | `↑ +2 opak.` | akcent |
| nižší váha | `↓ -2,5 kg` | neutrální šedý |
| stejná váha, méně opakování | `↓ -2 opak.` | neutrální |
| vše stejné | `= stejně` | neutrální |
| žádný předchozí záznam | `+ nový` | neutrální |

**Čísla a čeština:** formát `cs-CZ` (mezera jako oddělovač tisíců, desetinná čárka: `9 870`, `82,5 kg`). Datum `PONDĚLÍ 9. 11. 2026`. Skloňování 1 / 2-4 / 5+, desetinná čísla v genitivu jednotného čísla:
- série: `1 pracovní série`, `3 pracovní série`, `24 pracovních sérií`
- auta: `≈ 1 osobní auto`, `≈ 3 osobní auta`, `≈ 7 osobních aut`, `≈ 6,6 osobního auta` (objem / 1500 kg, zaokrouhleno na 1 desetinné místo)

**Dlaždice rekordu (vpravo dole):**
- Je-li PR: plná akcentová dlaždice, `NOVÉ MAXIMUM`, název cviku, `50 kg × 10`, pod tím `+20 kg oproti minule` (nebo `+N opak. oproti minule`, případně `první záznam`).
- Bez PR: neutrální tmavá dlaždice, popisek a ikona v akcentu, `NEJTĚŽŠÍ SÉRIE`, cvik s nejvyšší váhou top série, pod tím `dnešní top set`.

**Automatické zmenšení:** nadpis (min. 40 px), objem, počet sérií a hodnota v dlaždici rekordu se zmenšují po 2 px, dokud se nevejdou (min. 24 px). Měřit až po načtení fontů.

## Svalová mapa

SVG v `assets/` je převzaté z původního návrhu appky a **intenzity jsou zapečené pro ukázkový trénink** (nohy + core). Pro produkci použij vlastní svalovou mapu appky (tu, ze které vznikl původní sumář) a jen ji přebarvi podle těchto pravidel:

| Stav svalu | CSS proměnná | Ember |
|---|---|---|
| hlavní (nejvíc zapojený) | `--muscle-primary` = akcent | `#FF6A2B` |
| vedlejší | `--muscle-secondary` = mix(akcent, dlaždice, 60 %) | `#A24925` |
| doplňkový | `--muscle-tertiary` = mix(akcent, dlaždice, 30 %) | `#5C3121` |
| nezapojený | `--muscle-inactive` | `#2B2E35` |
| nezapojený, druhý odstín | `--muscle-inactive-alt` | `#272A30` |
| hlava | `--muscle-head` | `#383C45` |

Mezery mezi svaly jsou průhledné (prosvítá dlaždice `#16181C`), nekresli je jako obrys. Každá postava je v boxu 226 × 449 px, mezera 4 px, skupina přesahuje vnitřní okraj dlaždice o 12 px na každou stranu.

## Barevné varianty

Výchozí akcent je Ember `#FF6A2B`. Šablona umí i ostatní varianty z návrhu, stačí změnit `theme.accent`: Ice `#3DDCFF`, Neon `#FF4D9A`, Ultra `#A98BFF`. Odvozené barvy se dopočítají samy. Text na akcentu je vždy `#0B0C0E`.

## Možnosti renderu do PNG

- **Server / headless prohlížeč:** použij `template/summary.html` jak je a `render/render.cjs` (Playwright). Nejméně práce, výsledek přesně odpovídá náhledu.
- **Webová appka v prohlížeči:** vykresli šablonu do skrytého kontejneru a převeď na PNG (např. `html-to-image`). Fonty musí být načtené před snímkem.
- **Mobilní appka (React Native / Flutter / nativní):** přepiš layout do nativních komponent podle `tokens.json` (layout je čistě flexbox, žádný grid) a vyfoť ho offscreen (např. `react-native-view-shot`). Fonty z `fonts/` přibal do appky.
- **Serverless bez prohlížeče:** Satori + resvg, layout je kompatibilní (flex, žádné CSS gridy ani pseudo-elementy).

Snímkuj až po `document.fonts.ready` (šablona pak nastaví `body[data-ready="true"]`).

## Akceptační kritéria

- [ ] `sample-data.json` dá výsledek vizuálně shodný s `preview/ember-1080.png`.
- [ ] `edge-case-data.json` dá výsledek shodný s `preview/edge-case-1080.png` (výpustky, neutrální štítky, dlaždice bez rekordu, zmenšený objem, „1 pracovní série“).
- [ ] Česká diakritika se vykresluje vlastními fonty, ne náhradním systémovým písmem.
- [ ] Výstup je PNG 1080 × 1080 a jde ho z appky sdílet nebo uložit.
- [ ] Svalová mapa vychází z dat tréninku, ne z ukázkového SVG.

## Fonty a licence

Unbounded, Inter Tight a JetBrains Mono jsou pod SIL Open Font License 1.1 (licence v `fonts/`), lze je přibalit do appky i komerčně.
