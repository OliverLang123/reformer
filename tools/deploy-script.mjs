// Nasazení Apps Scriptu na stejnou adresu: nahraje kód a aktualizuje nasazení webové appky.
// ID nasazení se bere z proměnné prostředí REFORMER_DEPLOYMENT (není v repozitáři).
//   REFORMER_DEPLOYMENT=<ID nasazení> npm run deploy:script
import { execFileSync } from 'node:child_process';

const id = process.env.REFORMER_DEPLOYMENT;
if (!id) {
  console.error('Chybí REFORMER_DEPLOYMENT (ID nasazení webové appky, je v CLAUDE.md).');
  process.exit(1);
}
const run = (args) => execFileSync('npx', ['clasp', ...args], { stdio: 'inherit' });
run(['push', '--force']);
run(['update-deployment', id]);
console.log('Nasazeno. Když se měnily sloupce, listy nebo vzorce, spusť v editoru Apps Script funkci setup.');
