import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function readAlerts({ fixturePath } = {}) {
  const root = join(fileURLToPath(new URL('../..', import.meta.url)));
  const path = fixturePath ?? join(root, 'xdr', 'fixtures', 'brute-force.json');
  const fixture = JSON.parse(await readFile(path, 'utf8'));

  if (!fixture || typeof fixture !== 'object' || !Array.isArray(fixture.alerts)) {
    throw new Error('brute-force fixture 형식이 아닙니다.');
  }

  return fixture.alerts.map((alert) => {
    const timestamp = typeof alert?.timestamp === 'string' ? alert.timestamp : '';
    const srcip = typeof alert?.data?.srcip === 'string' ? alert.data.srcip : '';
    const srcuser = typeof alert?.data?.srcuser === 'string' ? alert.data.srcuser : '';
    const level = Number.isFinite(Number(alert?.rule?.level)) ? Number(alert.rule.level) : 0;
    const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';

    return `${timestamp}\t${srcip}\t${srcuser}\t${level}\t${description}`;
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const lines = await readAlerts();
  if (lines.length > 0) {
    console.log(lines.join('\n'));
  }
}
