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
    ['Objem', 'volume'], // jen vzorec, skript ani appka sem nepíšou
  ],
  'Tělo': [
    ['Datum', 'date'],
    ['Váha', 'weight'],
    ['Zdroj', 'source'],
  ],
};

// Přehledy a pomocné listy jen ze vzorců (etapa 4).
const FORMULA_SHEETS = ['Poslední trénink', 'Tento týden', 'Maxima', 'Objem po týdnech'];

const SET_TYPES = ['normální', 'rozcvička', 'do selhání', 'drop'];
const MODES = ['váha × opakování', 'na stranu', 'vlastní váha', 'čas', 'čas na stranu', 'vzdálenost a čas'];

// Pole, která jsou jen datum (bez času) a pole s datem i časem.
const DATE_FIELDS = { date: true };
const DATETIME_FIELDS = { start: true, end: true, confirmedAt: true };
