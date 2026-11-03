// Výchozích 34 cviků. setup je přidá do listu Cviky jen tehdy, když tam cvik s tímto
// Názvem ještě není, takže úpravy v tabulce nepřepíše. Partie používají názvy svalů
// z grafiky react-native-body-highlighter. Pokyny trenéra doplňuje Claude v chatu.

const SEED_EXERCISES = [
  {
    name: 'Rowing Machine', cz: 'veslo', mode: 'vzdálenost a čas',
    primary: 'quadriceps, upper-back', secondary: 'gluteal, hamstring, biceps, lower-back, calves', bwFactor: 0,
    howto: ['Záběr začni nohama, pak záklon trupu a nakonec přitažení rukou k hrudníku', 'Záda rovná, ramena dole', 'Zpátky v opačném pořadí: ruce, trup, nohy', 'Klidné tempo na rozcvičku, zhruba 20 až 24 temp za minutu'],
  },
  {
    name: 'Squat (Barbell)', cz: 'dřep s osou', mode: 'váha × opakování',
    primary: 'quadriceps, gluteal', secondary: 'adductors, hamstring, lower-back, abs', bwFactor: 0,
    howto: ['Osa na horní části zad, chodidla na šířku ramen, špičky mírně ven', 'Nádech do břicha a zpevnit trup před každým opakováním', 'Kolena jdou ve směru špiček, paty zůstávají na zemi', 'Dolů aspoň do vodorovné polohy stehen, záda neutrální', 'Nahoru tlakem přes celé chodidlo'],
  },
  {
    name: 'Hack Squat (Machine)', cz: 'hack dřep na stroji', mode: 'váha × opakování',
    primary: 'quadriceps, gluteal', secondary: 'adductors, hamstring', bwFactor: 0,
    howto: ['Záda a pánev celou dobu opřené o opěrku', 'Chodidla na šířku ramen uprostřed plošiny', 'Pomalu dolů co nejhlouběji bez podsazení pánve', 'Nahoru bez zamčení kolen'],
  },
  {
    name: 'Romanian Deadlift (Barbell)', cz: 'rumunský mrtvý tah', mode: 'váha × opakování',
    primary: 'hamstring, gluteal', secondary: 'lower-back, trapezius, forearm, adductors', bwFactor: 0,
    howto: ['Start ve stoje, osa v rukou na šířku ramen', 'Kolena lehce pokrčená, pohyb vychází z kyčlí, zadek jde dozadu', 'Osa klouže těsně po stehnech, záda rovná', 'Dolů jen tak hluboko, dokud cítíš tah v zadní straně stehen', 'Nahoru zatnutím hýždí, bez záklonu'],
  },
  {
    name: 'Bulgarian Split Squat (Dumbbell)', cz: 'bulharský dřep', mode: 'na stranu',
    primary: 'quadriceps, gluteal', secondary: 'adductors, hamstring, calves', bwFactor: 0,
    howto: ['Zadní noha nártem na lavici, přední asi dva kroky před ní', 'Jednoručky v rukou podél těla, trup mírně v předklonu', 'Dolů svisle, dokud zadní koleno skoro nedosedne', 'Přední koleno ve směru špičky, tlak přes patu', 'Odcvič všechna opakování na jednu nohu, pak vyměň'],
  },
  {
    name: 'Hip Thrust (Barbell)', cz: 'hip thrust', mode: 'váha × opakování',
    primary: 'gluteal', secondary: 'hamstring, quadriceps, adductors', bwFactor: 0,
    howto: ['Lopatky opřené o lavici, osa v ohbí kyčlí (s podložkou)', 'Chodidla na šířku pánve, holeně nahoře svisle', 'Zvedni pánev, až je trup se stehny v jedné rovině', 'Nahoře krátká pauza a zatnout hýždě, žebra dole, bez prohnutí', 'Pomalu dolů'],
  },
  {
    name: 'Single Leg Standing Calf Raise (Dumbbell)', cz: 'jednonožné výpony ve stoje', mode: 'na stranu',
    primary: 'calves', secondary: '', bwFactor: 0,
    howto: ['Špička na vyvýšeném okraji, pata volně dole', 'Jednoručka v ruce na straně cvičící nohy, druhou rukou se přidržuj', 'Noha propnutá v koleni', 'Nahoru co nejvýš, dolů pomalu a dole krátká pauza', 'Váha jedné jednoručky, 0 = bez váhy'],
  },
  {
    name: 'Seated Calf Raise', cz: 'výpony vsedě', mode: 'váha × opakování',
    primary: 'calves', secondary: '', bwFactor: 0,
    howto: ['Kolena pod opěrkou, špičky na okraji plošiny', 'Koleno pokrčené, tím se zapojí hlavně sval soleus', 'Nahoru co nejvýš, dolů pomalu do plného protažení', 'Dole krátká pauza, bez houpání'],
  },
  {
    name: 'Dead Bug', cz: 'dead bug', mode: 'vlastní váha',
    primary: 'abs', secondary: 'obliques', bwFactor: 0,
    howto: ['Leh na zádech, ruce nahoru, kolena a kyčle v pravém úhlu', 'Bederní páteř přitisknutá k zemi celou dobu', 'Pomalu natáhni opačnou ruku a nohu nad zem, s výdechem', 'Vrať se a vyměň strany', 'Opakování se počítají na stranu'],
  },
  {
    name: 'Cable Core Pallof Press', cz: 'Pallof press', mode: 'na stranu',
    primary: 'obliques, abs', secondary: 'deltoids, gluteal', bwFactor: 0,
    howto: ['Bokem ke kladce, rukojeť ve výšce hrudníku', 'Stoj na šířku ramen, hýždě a břicho zpevněné', 'Natáhni ruce před sebe a nedovol trupu se natočit', 'Krátká pauza s nataženýma rukama, pak zpět k hrudníku', 'Odcvič stranu, otoč se a opakuj'],
  },
  {
    name: 'Leg Raise Parallel Bars', cz: 'zvedání nohou na bradlech', mode: 'vlastní váha',
    primary: 'abs', secondary: 'obliques, forearm', bwFactor: 0,
    howto: ['Opora na předloktích nebo v natažených pažích, ramena dole', 'Bez houpání zvedni nohy aspoň do vodorovné polohy', 'Nahoře lehce podsaď pánev', 'Pomalu dolů'],
  },
  {
    name: 'Pull Up', cz: 'shyby', mode: 'vlastní váha',
    primary: 'upper-back', secondary: 'biceps, forearm, deltoids, trapezius', bwFactor: 1,
    howto: ['Nadhmat o něco širší než ramena', 'Start ze svisu, lopatky stáhni dolů', 'Přitahuj, dokud brada nepřejde nad hrazdu', 'Dolů kontrolovaně do napnutých paží, bez houpání', 'Zátěž se zapisuje do KG, bez zátěže nech prázdné'],
  },
  {
    name: 'Bench Press (Barbell)', cz: 'bench press', mode: 'váha × opakování',
    primary: 'chest', secondary: 'triceps, deltoids', bwFactor: 0,
    howto: ['Lopatky stažené k sobě a dolů, chodidla pevně na zemi', 'Úchop o něco širší než ramena', 'Osa dolů na spodní část hrudníku, lokty asi 45° od těla', 'Krátký dotyk hrudníku a tlak nahoru, zadek na lavici'],
  },
  {
    name: 'Incline Bench Press (Barbell)', cz: 'bench na šikmé lavici', mode: 'váha × opakování',
    primary: 'chest', secondary: 'deltoids, triceps', bwFactor: 0,
    howto: ['Lavice skloněná asi 30°', 'Lopatky stažené, chodidla na zemi', 'Osa dolů pod klíční kosti', 'Tlak nahoru a mírně dozadu nad ramena'],
  },
  {
    name: 'Shoulder Press (Dumbbell)', cz: 'tlak na ramena s jednoručkami', mode: 'váha × opakování',
    primary: 'deltoids', secondary: 'triceps, trapezius', bwFactor: 0,
    howto: ['Vsedě s opřenými zády, jednoručky ve výšce uší', 'Břicho zpevněné, bez prohnutí v bedrech', 'Tlak nahoru, jednoručky se nahoře skoro dotknou', 'Dolů pomalu do výšky uší', 'Váha je součet obou jednoruček'],
  },
  {
    name: 'Bent Over Row (Barbell)', cz: 'přítah s osou v předklonu', mode: 'váha × opakování',
    primary: 'upper-back', secondary: 'biceps, lower-back, deltoids, trapezius, forearm', bwFactor: 0,
    howto: ['Předklon asi 45°, záda rovná, kolena lehce pokrčená', 'Osa v natažených pažích pod rameny', 'Přitáhni osu k pupku, lokty podél těla', 'Nahoře stáhni lopatky, dolů kontrolovaně', 'Trup se nehýbe, bez švihu'],
  },
  {
    name: 'Single Leg Romanian Deadlift (Dumbbell)', cz: 'jednonožný RDL s jednoručkou', mode: 'na stranu',
    primary: 'hamstring, gluteal', secondary: 'lower-back, adductors, calves', bwFactor: 0,
    howto: ['Stoj na jedné noze, koleno lehce pokrčené', 'Jednoručka v opačné ruce, než je stojná noha', 'Předklon z kyčle, volná noha jde dozadu v jedné linii s trupem', 'Pánev zůstává rovně, nenatáčí se', 'Nahoru zatnutím hýždě stojné nohy'],
  },
  {
    name: 'Dumbbell Step Up', cz: 'step-up na bednu', mode: 'na stranu',
    primary: 'quadriceps, gluteal', secondary: 'hamstring, calves', bwFactor: 0,
    howto: ['Celé chodidlo na bedně, koleno nad kotníkem', 'Vystup silou přední nohy, zadní se jen odlepí', 'Nahoře se narovnej, pak pomalu dolů', 'Odcvič všechna opakování na jednu nohu, pak vyměň', 'Váha je součet jednoruček, 0 = bez váhy'],
  },
  {
    name: 'Side Plank', cz: 'boční plank', mode: 'čas na stranu',
    primary: 'obliques', secondary: 'abs, deltoids, gluteal', bwFactor: 0,
    howto: ['Opora na předloktí, loket pod ramenem', 'Tělo v jedné linii od hlavy po kotníky', 'Pánev nahoře, neklesá ani necouvá dozadu', 'Dýchej klidně, čas se zapisuje na jednu stranu'],
  },
  {
    name: 'Copenhagen Plank', cz: 'Copenhagen plank', mode: 'čas na stranu',
    primary: 'adductors, obliques', secondary: 'abs', bwFactor: 0,
    howto: ['Boční opora na předloktí, horní noha na lavici (lehčí verze koleno, těžší kotník)', 'Spodní noha volně pod lavicí nebo přitažená k ní', 'Pánev zvednutá, tělo v jedné linii', 'Výdrž, čas se zapisuje na jednu stranu'],
  },
  {
    name: 'Tibialis Raise', cz: 'zvedání špiček', mode: 'vlastní váha',
    primary: 'tibialis', secondary: '', bwFactor: 0,
    howto: ['Záda opřená o zeď, paty asi 30 cm od zdi', 'Zvedni špičky co nejvýš k holením', 'Nahoře krátká pauza, dolů pomalu', 'Bez houpání trupem'],
  },
  {
    name: 'Jump Rope', cz: 'švihadlo', mode: 'vlastní váha',
    primary: 'calves', secondary: 'quadriceps, deltoids, forearm', bwFactor: 0,
    howto: ['Lehké odrazy po špičkách, kolena lehce pokrčená', 'Švihadlo točí zápěstí, lokty u těla', 'Vyskakuj jen pár centimetrů', 'Opakování = počet poskoků'],
  },
  {
    name: 'Box Jump', cz: 'výskok na bednu', mode: 'vlastní váha',
    primary: 'quadriceps, gluteal', secondary: 'calves, hamstring', bwFactor: 1,
    howto: ['Stoj kousek před bednou na šířku pánve', 'Švih paží a výskok, doskoč měkce celými chodidly', 'Nahoře se narovnej', 'Dolů sestup, neseskakuj', 'Kvalita před počtem, mezi skoky krátká pauza'],
  },
  {
    name: 'Crunch (Machine)', cz: 'sklapovačky na stroji', mode: 'váha × opakování',
    primary: 'abs', secondary: 'obliques', bwFactor: 0,
    howto: ['Nastav sedák tak, aby osa otáčení byla v úrovni pasu', 'Sklápěj trup břichem, ne rukama', 'Dole výdech a krátká pauza', 'Zpátky pomalu, závaží nepouštěj'],
  },
  {
    name: 'Behind the Back Curl (Cable)', cz: 'bicepsový zdvih na kladce za zády', mode: 'váha × opakování',
    primary: 'biceps', secondary: 'forearm', bwFactor: 0,
    howto: ['Zády ke spodní kladce, rukojeť v ruce za tělem', 'Krok dopředu, aby byl biceps protažený', 'Lokty zůstávají za tělem, pohyb jen v lokti', 'Nahoře zatni, dolů pomalu'],
  },
  {
    name: 'Rear Delt Reverse Fly (Machine)', cz: 'zadní delty na stroji', mode: 'váha × opakování',
    primary: 'deltoids', secondary: 'upper-back, trapezius', bwFactor: 0,
    howto: ['Hrudník na opěrce, rukojeti ve výšce ramen', 'Lokty lehce pokrčené a pevné', 'Rozpaž do stran, tah jde ze zadních ramen, ne z lopatek', 'Zpátky pomalu'],
  },
  {
    name: 'Lateral Raise (Dumbbell)', cz: 'upažování s jednoručkami', mode: 'váha × opakování',
    primary: 'deltoids', secondary: 'trapezius', bwFactor: 0,
    howto: ['Stoj, jednoručky podél těla, lokty lehce pokrčené', 'Upaž do výšky ramen, malíček mírně nahoru', 'Ramena nekrč k uším, bez švihu', 'Dolů pomalu', 'Váha je součet obou jednoruček'],
  },
  {
    name: 'Leg Press (Machine)', cz: 'leg press', mode: 'váha × opakování',
    primary: 'quadriceps, gluteal', secondary: 'adductors, hamstring', bwFactor: 0,
    howto: ['Záda a pánev opřené, chodidla na šířku ramen uprostřed plošiny', 'Dolů, dokud se pánev neodlepí od opěrky', 'Kolena ve směru špiček', 'Nahoru bez zamčení kolen'],
  },
  {
    name: 'Chest Fly (Machine)', cz: 'rozpažování na stroji', mode: 'váha × opakování',
    primary: 'chest', secondary: 'deltoids', bwFactor: 0,
    howto: ['Rukojeti ve výšce hrudníku, lokty lehce pokrčené', 'Lopatky stažené a opřené', 'Spoj ruce před hrudníkem obloukem, ne tlakem', 'Zpátky pomalu do protažení hrudníku'],
  },
  {
    name: 'Tahání kladky - Po Ruce', cz: 'tahání kladky po ruce', mode: 'váha × opakování',
    primary: 'upper-back', secondary: 'biceps, forearm', bwFactor: 0,
    howto: ['Vlastní cvik, popis doplní trenér'],
  },
  {
    name: 'Triceps Dip', cz: 'dipy', mode: 'vlastní váha',
    primary: 'triceps, chest', secondary: 'deltoids', bwFactor: 1,
    howto: ['Opora na bradlech v natažených pažích, ramena dole', 'Dolů, dokud nejsou nadloktí zhruba vodorovně', 'Trup mírně v předklonu, lokty jdou dozadu', 'Nahoru do natažených paží', 'Zátěž se zapisuje do KG, bez zátěže nech prázdné'],
  },
  {
    name: 'Decline Bench Press (Barbell)', cz: 'bench na negativní lavici', mode: 'váha × opakování',
    primary: 'chest', secondary: 'triceps, deltoids', bwFactor: 0,
    howto: ['Nohy zaháknuté, lopatky stažené', 'Osa dolů na spodní okraj hrudníku', 'Lokty asi 45° od těla', 'Tlak nahoru nad hrudník'],
  },
  {
    name: 'Skullcrusher (Dumbbell)', cz: 'skullcrusher', mode: 'váha × opakování',
    primary: 'triceps', secondary: 'forearm', bwFactor: 0,
    howto: ['Leh na lavici, jednoručky nad rameny', 'Nadloktí zůstávají na místě, pohyb jen v lokti', 'Jednoručky pomalu dolů vedle hlavy', 'Natáhni paže zpět nahoru', 'Váha je součet obou jednoruček'],
  },
  {
    name: 'Bicep Curl (Dumbbell)', cz: 'bicepsový zdvih s jednoručkami', mode: 'váha × opakování',
    primary: 'biceps', secondary: 'forearm', bwFactor: 0,
    howto: ['Stoj, jednoručky podél těla, dlaně dopředu', 'Lokty u těla, nepohybují se dopředu', 'Zdvihni k ramenům bez švihu trupem', 'Dolů pomalu do natažených paží', 'Váha je součet obou jednoruček'],
  },
].map((e) => Object.assign({}, e, { howto: e.howto.map((b) => '• ' + b).join('\n') }));
