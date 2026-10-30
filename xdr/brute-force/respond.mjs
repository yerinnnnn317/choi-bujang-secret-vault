import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'alerts.log');
const BLOCK_ACTION = 'block';

function isoNowWithOffset(offsetMinutes = 15) {
  const now = new Date();
  now.setMinutes(now.getMinutes() + offsetMinutes);
  return now.toISOString();
}

export function buildDenyRules(result, now = new Date()) {
  if (!result || typeof result !== 'object' || result.schema !== 'aleph.xdr.result.v1' || !Array.isArray(result.decisions)) {
    return { denyRules: [], logLines: [], blockedCount: 0 };
  }

  const denyRules = [];
  const logLines = [];

  for (const decision of result.decisions) {
    const alertId = typeof decision?.alertId === 'string' ? decision.alertId : '(unknown)';
    const action = decision?.action;
    const confidence = Number.isFinite(Number(decision?.confidence)) ? Number(decision.confidence) : 0;
    const reason = typeof decision?.reason === 'string' ? decision.reason : 'no-reason';
    const line = `${now.toISOString()}\t${alertId}\t${action}\t${confidence}\t${reason}`;
    logLines.push(line);

    if (action === BLOCK_ACTION) {
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
      denyRules.push({
        ruleId: `xdr.brute-force.block.${alertId}`,
        decision: 'deny',
        reasonCode: 'brute_force_block',
        alertId,
        expiresAt,
        source: 'xdr/brute-force',
        confidence,
        reason,
      });
    }
  }

  return { denyRules, logLines, blockedCount: denyRules.length };
}

export async function respond(result, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const { denyRules, logLines, blockedCount } = buildDenyRules(result, now);
  const logPath = options.logPath ?? LOG_FILE;
  await mkdir(dirname(logPath), { recursive: true });
  const content = `${logLines.map((line) => `${line}\n`).join('')}`;
  if (content) {
    await appendFile(logPath, content, 'utf8');
  }
  return {
    schema: 'aleph.xdr.respond.v1',
    denied: denyRules,
    blockedCount,
    logPath,
    logLines,
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const resultPath = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), 'result.json');
  try {
    const raw = await readFile(resultPath, 'utf8');
    const result = JSON.parse(raw);
    const response = await respond(result);
    console.log(JSON.stringify({
      schema: response.schema,
      blockedCount: response.blockedCount,
      denied: response.denied.map((rule) => ({
        ruleId: rule.ruleId,
        alertId: rule.alertId,
        expiresAt: rule.expiresAt,
        decision: rule.decision,
      })),
    }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'respond 실행 오류');
    process.exitCode = 1;
  }
}
