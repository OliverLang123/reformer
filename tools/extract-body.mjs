// Vytáhne SVG cesty postavy (muž zepředu a zezadu) z npm balíčku react-native-body-highlighter
// (MIT, ELABBASSI Hicham) do js/body-map.js. Z knihovny se bere jen geometrie, ne komponenty.
//
//   npm pack react-native-body-highlighter@3.2.0 && mkdir bh && tar xzf react-native-body-highlighter-3.2.0.tgz -C bh
//   node tools/extract-body.mjs bh/package

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const pkg = process.argv[2];
if (!pkg) {
  console.log('Použití: node tools/extract-body.mjs <rozbalený balíček>/package');
  process.exit(1);
}
const meta = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));

function load(file, name) {
  const ctx = { exports: {} };
  vm.runInNewContext(readFileSync(join(pkg, 'dist', 'assets', file), 'utf8'), ctx);
  return ctx.exports[name].map((part) => {
    const p = part.path || {};
    const d = [...(p.common || []), ...(p.left || []), ...(p.right || [])];
    return [part.slug, d];
  }).filter(([, d]) => d.length);
}

const front = load('bodyFront.js', 'bodyFront');
const back = load('bodyBack.js', 'bodyBack');
const out = `// Postava pro svalovou mapu: SVG cesty z react-native-body-highlighter ${meta.version}
// (https://github.com/HichamELBSI/react-native-body-highlighter), licence MIT,
// Copyright (c) 2022 ELABBASSI Hicham. Vygenerováno skriptem tools/extract-body.mjs, neupravovat ručně.
// Každá část: [partie, [cesty]]. Partie odpovídají sloupcům Partie hlavní a vedlejší v listu Cviky,
// navíc head, hair, hands, feet, ankles, knees (nejsou svaly).

export const BODY_VIEWBOX = { front: '0 0 724 1448', back: '724 0 724 1448' };

export const BODY = ${JSON.stringify({ front, back })};
`;
writeFileSync(new URL('../js/body-map.js', import.meta.url), out);
console.log('js/body-map.js:', front.length, 'částí zepředu,', back.length, 'zezadu,', out.length, 'znaků');
