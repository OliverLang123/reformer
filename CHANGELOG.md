# Změny

## 0.7.1 (12. 11. 2026)

Trénink: horní lišta a lišta odpočinku nebo stopek drží na místě i na iPhonu v PWA. Při tréninku se scrolluje jen obsah mezi lištami, ne celá stránka.

## 0.7.0 (připraveno 11. 11. 2026)

- Synchronizace: obnovení dat nepřepíše čerstvě uložený trénink, selhávající položka neblokuje frontu, chyba odeslání je vidět a položku jde zahodit, appka hlídá verzi skriptu a sama načte novou verzi.
- Zápis série: neplatné číslo se nepotvrdí, mazání série vždy s dotazem a možností vrátit, další série převezme skutečnou váhu, nahrazení cviku nechá potvrzené série původnímu cviku.
- Ovládání: větší dotykové cíle, okno Změnit pořadí, poznámka k tréninku kdykoli, nový cvik formulářem, karta při chybě místo prázdné obrazovky.
- List Rutiny: úsporný zápis (prázdné buňky dědí, sloupec Sérií) a kontrola rutin na úvodu i ve skriptu.
- Tabulka: nový list Poslední tréninky, Tento týden od pondělí s minulým týdnem, sloupce Objem a Pauza v listu Poslední trénink.
- Skript: API verze 3, kódy chyb, zápis jen změněných řádků, akce `saveExercise` a `checkRoutines`, videa do 8 MB, jednorázové akce jen při údržbě.
- Souhrn do Stravy: obrázek pro trénink bez vah, jedna série bez váhy jen počtem.
- Testy: `npm test` a `npm run test:e2e`.

## 0.6.0 (10. 11. 2026)

Stopky u cviků na čas, váha jedné jednoručky (sloupec Jednoručky), řádek Zápis a výpočet na kartě cviku, sloupec ČAS P.

## 0.5.1 (4. 11. 2026)

Fotka z videa i na iPhonu, chybějící fotka se doplní z videa.

## 0.5.0 (4. 11. 2026)

Karty cviků s celou historií, vlastní videa a fotky v Drive přes skript.

## 0.4.0 (4. 11. 2026)

Historie: celý seznam, detail, úprava a smazání tréninku.

## 0.3.x (4. 11. 2026)

Souhrn do Stravy: název, popis a obrázek se svalovou mapou. Přehledy ze vzorců.

## 0.2.x (3. 11. 2026)

Zápis tréninku, MINULE, maxima, odpočinek, fronta offline. Import historie.

## 0.1.0 (3. 11. 2026)

Kostra PWA, Apps Script, tabulka.
