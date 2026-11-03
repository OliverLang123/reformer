#!/usr/bin/env node
// Reference renderer: workout JSON -> 1080x1080 PNG using the HTML template.
//
// Usage:
//   npm i -D playwright && npx playwright install chromium
//   node render/render.cjs template/sample-data.json out.png            # 1080 x 1080
//   node render/render.cjs template/sample-data.json out@2x.png --scale 2
//
// The template waits for the self-hosted fonts and auto-fits long values
// before it sets body[data-ready="true"]; never screenshot before that.

const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function main() {
  const args = process.argv.slice(2);
  const dataPath = args[0];
  const outPath = args[1] || 'summary.png';
  const scaleIdx = args.indexOf('--scale');
  const scale = scaleIdx >= 0 ? Number(args[scaleIdx + 1]) || 1 : 1;
  if (!dataPath) {
    console.error('Usage: node render.cjs <data.json> [out.png] [--scale 1|2]');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const template = pathToFileURL(path.join(__dirname, '..', 'template', 'summary.html')).href;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: scale });
    await page.goto(template);
    await page.waitForSelector('body[data-ready="true"]');
    await page.evaluate(async (d) => {
      document.body.removeAttribute('data-ready');
      await window.renderSummary(d);
    }, data);
    await page.waitForSelector('body[data-ready="true"]');
    await page.locator('#card').screenshot({ path: outPath });
    console.log('Saved', outPath);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
