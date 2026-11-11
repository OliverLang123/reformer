// Společné funkce nástrojů: dotaz v terminálu (klíč skrytě) a volání skriptu.
import { createInterface } from 'node:readline';

export function ask(question, hidden) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(question); };
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(a.trim());
    });
  });
}

export async function call(cfg, action, params = {}) {
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: cfg.key, action, ...params }),
    redirect: 'follow',
  });
  const body = await res.json().catch(() => ({ ok: false, error: 'nečitelná odpověď (HTTP ' + res.status + ')' }));
  if (!body.ok) {
    throw new Error(body.code === 'maintenance' ? body.error + '. Nastav ji ve Vlastnostech skriptu a po dokončení zase smaž.' : body.error);
  }
  return body;
}
