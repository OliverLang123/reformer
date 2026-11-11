# Přibalené knihovny

| Soubor | Knihovna | Verze | Licence |
| --- | --- | --- | --- |
| `html-to-image.js` | [html-to-image](https://github.com/bubkoo/html-to-image) `dist/html-to-image.js` (UMD, `window.htmlToImage`) | 1.11.13 | MIT |
| `htm-preact.module.js` | [htm](https://github.com/developit/htm) `preact/standalone.module.js` (obsahuje [Preact](https://preactjs.com) a hooks) | htm 3.1.1 | htm: Apache 2.0, Preact: MIT |

Soubory jsou zkopírované beze změny (htm z `node_modules` po `npm i -D htm@3.1.1`, html-to-image z `npm pack html-to-image@1.11.13`), aby appka fungovala offline a bez sestavování.

Postava pro svalovou mapu (`js/body-map.js`) jsou jen SVG cesty z [react-native-body-highlighter](https://github.com/HichamELBSI/react-native-body-highlighter) 3.2.0 (MIT, Copyright (c) 2022 ELABBASSI Hicham), vytažené skriptem `tools/extract-body.mjs`.
Licence: `LICENSE-html-to-image.txt`, `LICENSE-htm.txt`, `LICENSE-preact.txt`, `LICENSE-react-native-body-highlighter.txt`.
