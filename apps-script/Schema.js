// Listy a sloupce tabulky. Názvy se nemění: podle nich se orientuje appka, tento skript
// i Claude v chatu. Pořadí sloupců může uživatel v tabulce změnit, hledají se podle záhlaví.
// Druhá hodnota je klíč v JSON, kterým skript mluví s appkou.

const TZ = 'Europe/Prague';

const SCHEMA = {
  'Cviky': [
    ['Název', 'name'],
    ['Česky', 'cz'],
    ['Zápis', 'mode'],
    ['Partie hlavní', 'primary'],
    ['Partie vedlejší', 'secondary'],
    ['Podíl tělesné váhy', 'bwFactor'],
    ['Provedení', 'howto'],
    ['Pokyny trenéra', 'coach'],
    ['Video', 'video'],
    ['Fotka', 'photo'],
    ['Jednoručky', 'dumbbells'], // 2 = dvě jednoručky (KG je váha jedné), 1 = jedna, prázdné = není jednoručka
  ],
  'Rutiny': [
    ['Rutina', 'routine'],
    ['Týden', 'week'],
    ['Poznámka k rutině', 'routineNote'],
    ['Pořadí', 'order'],
    ['Cvik', 'exercise'],
    ['Superset', 'superset'],
    ['Typ', 'type'],
    ['KG', 'kg'],
    ['OPAK.', 'reps'],
    ['ČAS', 'time'],
    ['KM', 'km'],
    ['Odpočinek', 'rest'],
    ['Poznámka', 'note'],
    ['Sérií', 'count'], // N stejných sérií za sebou (prázdné = 1), úsporný zápis rutin
  ],
  'Tréninky': [
    ['ID', 'id'],
    ['Datum', 'date'],
    ['Začátek', 'start'],
    ['Konec', 'end'],
    ['Rutina', 'routine'],
    ['Poznámka', 'note'],
  ],
  'Série': [
    ['ID', 'id'],
    ['Trénink', 'workout'],
    ['Cvik', 'exercise'],
    ['Pořadí', 'order'],
    ['Superset', 'superset'],
    ['Typ', 'type'],
    ['KG', 'kg'],
    ['OPAK.', 'reps'],
    ['ČAS', 'time'],
    ['KM', 'km'],
    ['V záloze', 'rir'],
    ['Poznámka ke cviku', 'exerciseNote'],
    ['Potvrzeno', 'confirmedAt'],
    ['ČAS P', 'timeR'], // čas pravé strany u zápisu „čas na stranu“ (ČAS je levá)
    ['Objem', 'volume'], // jen vzorec, skript ani appka sem nepíšou
  ],
  'Tělo': [
    ['Datum', 'date'],
    ['Váha', 'weight'],
    ['Zdroj', 'source'],
  ],
};

// Přehledy a pomocné listy jen ze vzorců (apps-script/Overview.js).
const FORMULA_SHEETS = ['Poslední trénink', 'Poslední tréninky', 'Tento týden', 'Maxima', 'Objem po týdnech'];

const SET_TYPES = ['normální', 'rozcvička', 'do selhání', 'drop'];
const MODES = ['váha × opakování', 'na stranu', 'vlastní váha', 'čas', 'čas na stranu', 'vzdálenost a čas'];

// Pole, která jsou jen datum (bez času) a pole s datem i časem.
const DATE_FIELDS = { date: true };
const DATETIME_FIELDS = { start: true, end: true, confirmedAt: true };

// Pole, která musí být číslo (nebo prázdná), a nejvyšší délka textů (ostatní texty 200 znaků).
const NUMBER_FIELDS = { kg: true, reps: true, km: true, rir: true, order: true, bwFactor: true, dumbbells: true };
const TEXT_LIMIT = { note: 2000, exerciseNote: 2000, routineNote: 2000, howto: 4000, coach: 2000 };
