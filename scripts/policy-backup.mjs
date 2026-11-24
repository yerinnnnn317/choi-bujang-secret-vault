// 10단계: 안전 정책 사본·해시 검증·시험 정책 차이 보기·복원.
// 안전 정책 = 1~9단계 접근 규칙(src/decider.mjs 의 규칙, aleph.config.json 의 allowedRoutes, DB 접근 정책 SQL).
// 실제 운영 정책 파일은 snapshot 때 읽기만 하고 절대 고치지 않는다. 시험·복원은 backup/policy-test 사본에서만 한다.
// 비밀값·토큰·메모 본문은 다루지 않는다. 해시는 줄바꿈(CRLF/LF)을 LF로 통일한 내용의 SHA-256이다.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAFE_DIR = join(root, 'backup', 'policy');
const TEST_DIR = join(root, 'backup', 'policy-test');
const MANIFEST = 'manifest.json';
const AUDIT_LOG = join(root, 'backup', 'audit-log.jsonl');

// 사본에 담을 안전 정책 항목. name 은 사본 안의 파일 이름이다.
const POLICY_ITEMS = Object.freeze([
  { name: 'decider.mjs', source: 'src/decider.mjs', kind: 'file' },
  { name: 'allowedRoutes.json', source: 'aleph.config.json#allowedRoutes', kind: 'allowedRoutes' },
  { name: 'db-policy.sql', source: 'supabase/step-2-training-notes.sql', kind: 'file' },
]);

// 시험용 침공: 사본의 판정기 규칙 한 줄을 바꿔 ID 없는 메모 전체 목록(GET /notes)을 허용하게 만든다.
const SIMULATED_ATTACK = Object.freeze({
  file: 'decider.mjs',
  find: "  { service: RESOURCE_ZONES.note.service, route: 'GET /notes/:id' },",
  replace: "  { service: RESOURCE_ZONES.note.service, route: 'GET /notes' }, // [시험용 침공] 메모 전체 목록 허용",
  description: '판정기 구역 규칙 한 줄을 바꿔 ID 없는 메모 전체 목록 경로(GET /notes)를 허용',
});

const normalize = text => text.replace(/\r\n/gu, '\n');
const sha256 = text => createHash('sha256').update(normalize(text), 'utf8').digest('hex');
const fail = message => { throw new Error(`중단: ${message}`); };

function readPolicyItem(item) {
  if (item.kind === 'allowedRoutes') {
    const config = JSON.parse(readFileSync(join(root, 'aleph.config.json'), 'utf8'));
    if (!Array.isArray(config.allowedRoutes)) fail('aleph.config.json 에 allowedRoutes 가 없습니다.');
    return `${JSON.stringify(config.allowedRoutes, null, 2)}\n`;
  }
  const path = join(root, item.source);
  if (!existsSync(path)) fail(`${item.source} 이 없습니다.`);
  return normalize(readFileSync(path, 'utf8'));
}

function currentCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function audit(action, detail) {
  mkdirSync(dirname(AUDIT_LOG), { recursive: true });
  // 감사 기록은 덧붙이기만 하고 지우거나 고치지 않는다.
  appendFileSync(AUDIT_LOG, `${JSON.stringify({ at: new Date().toISOString(), action, ...detail })}\n`);
}

// 검증한 사본을 다시 읽어 해시를 대조한다. 사본이 없거나 하나라도 맞지 않으면 중단한다.
export function verifySafeCopy() {
  const manifestPath = join(SAFE_DIR, MANIFEST);
  if (!existsSync(manifestPath)) fail('검증한 안전 정책 사본(backup/policy/manifest.json)이 없습니다.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.files) || manifest.files.length !== POLICY_ITEMS.length) {
    fail('사본 목록이 안전 정책 항목과 다릅니다.');
  }
  const contents = {};
  for (const entry of manifest.files) {
    const path = join(SAFE_DIR, entry.name);
    if (!existsSync(path)) fail(`사본 파일 ${entry.name} 이 없습니다.`);
    const text = normalize(readFileSync(path, 'utf8'));
    if (sha256(text) !== entry.sha256) fail(`사본 파일 ${entry.name} 의 해시가 맞지 않습니다.`);
    contents[entry.name] = text;
  }
  return { manifest, contents };
}

function snapshot({ replace = false } = {}) {
  if (existsSync(join(SAFE_DIR, MANIFEST)) && !replace) {
    fail('이미 검증한 사본이 있습니다. 덮어쓰지 않습니다(새로 만들려면 --replace).');
  }
  mkdirSync(SAFE_DIR, { recursive: true });
  const files = POLICY_ITEMS.map(item => {
    const text = readPolicyItem(item);
    writeFileSync(join(SAFE_DIR, item.name), text);
    return { name: item.name, source: item.source, sha256: sha256(text) };
  });
  const commit = currentCommit();
  const manifest = {
    version: `safe-policy-step9${commit ? `-${commit.slice(0, 7)}` : ''}`,
    basedOnCommit: commit,
    createdAt: new Date().toISOString(),
    note: '1~9단계 접근 규칙의 검증한 안전 정책 사본. 해시는 줄바꿈을 LF로 통일한 내용의 SHA-256.',
    files,
  };
  writeFileSync(join(SAFE_DIR, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  verifySafeCopy();
  audit('snapshot', { version: manifest.version, files: files.map(({ name, sha256: h }) => ({ name, sha256: h })) });
  console.log(`안전 정책 사본을 만들었습니다: ${manifest.version}`);
  for (const f of files) console.log(`- ${f.name} (${f.source}) sha256=${f.sha256}`);
}

function simulate() {
  const { manifest, contents } = verifySafeCopy();
  mkdirSync(TEST_DIR, { recursive: true });
  for (const entry of manifest.files) writeFileSync(join(TEST_DIR, entry.name), contents[entry.name]);
  const target = contents[SIMULATED_ATTACK.file];
  if (target.split(SIMULATED_ATTACK.find).length !== 2) fail('시험용으로 바꿀 규칙 줄을 사본에서 찾지 못했습니다.');
  writeFileSync(join(TEST_DIR, SIMULATED_ATTACK.file), target.replace(SIMULATED_ATTACK.find, SIMULATED_ATTACK.replace));
  writeFileSync(join(TEST_DIR, 'SIMULATED.md'),
    `# 시험용 정책 사본\n\n검증한 사본 ${manifest.version}에서 만든 시험 정책입니다. 실제 운영 정책이 아닙니다.\n\n`
    + `- 침공 흉내: ${SIMULATED_ATTACK.description}\n- 바꾼 파일: ${SIMULATED_ATTACK.file} (한 줄)\n`);
  audit('simulate', { from: manifest.version, file: SIMULATED_ATTACK.file, description: SIMULATED_ATTACK.description });
  console.log(`시험 정책을 만들었습니다(backup/policy-test). 침공 흉내: ${SIMULATED_ATTACK.description}`);
}

// 두 줄 배열의 차이를 LCS 로 구해 바뀐 줄만 돌려준다.
function lineDiff(beforeText, afterText) {
  const a = beforeText.split('\n');
  const b = afterText.split('\n');
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const changes = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i += 1; j += 1; }
    else if (i < a.length && (j >= b.length || dp[i + 1][j] >= dp[i][j + 1])) { changes.push({ type: '-', line: i + 1, text: a[i] }); i += 1; }
    else { changes.push({ type: '+', line: j + 1, text: b[j] }); j += 1; }
  }
  return changes;
}

// 검증한 사본과 시험 정책의 차이만 계산한다(실행 전 미리 보기).
export function planRestore() {
  const { manifest, contents } = verifySafeCopy();
  if (!existsSync(TEST_DIR)) fail('시험 정책 사본(backup/policy-test)이 없습니다.');
  const changed = [];
  for (const entry of manifest.files) {
    const path = join(TEST_DIR, entry.name);
    const testText = existsSync(path) ? normalize(readFileSync(path, 'utf8')) : '';
    if (sha256(testText) === entry.sha256) continue;
    changed.push({ name: entry.name, source: entry.source, changes: lineDiff(contents[entry.name], testText) });
  }
  return { manifest, changed };
}

function printPlan({ manifest, changed }) {
  console.log(`복원할 버전: ${manifest.version} (기준 커밋 ${manifest.basedOnCommit ?? '확인 불가'})`);
  if (changed.length === 0) {
    console.log('변경 범위: 없음 — 시험 정책이 검증한 사본과 같습니다.');
    return;
  }
  console.log(`변경 범위: 파일 ${changed.length}개`);
  for (const file of changed) {
    console.log(`- ${file.name} (${file.source}) · 줄 ${file.changes.length}개 차이`);
    for (const c of file.changes) console.log(`  ${c.type} ${c.line}: ${c.text}`);
  }
}

function diff() {
  printPlan(planRestore());
}

// 만들기 2 · 검증한 안전 정책 버전으로 시험 정책을 되돌린다.
// 실행 전에 바뀔 항목을 보여 주고, --yes 가 없으면 아무것도 바꾸지 않고 멈춘다.
// 바뀐 파일만 되돌리고 다른 정책 파일·감사 기록은 보존한다. 실제 운영 정책은 건드리지 않는다.
async function restore({ confirmed = false } = {}) {
  const plan = planRestore();
  printPlan(plan);
  if (plan.changed.length === 0) return;
  if (!confirmed) {
    console.log('위 항목만 되돌립니다. 실행하려면: npm run policy:restore -- --yes');
    return;
  }
  const { contents } = verifySafeCopy();
  for (const file of plan.changed) writeFileSync(join(TEST_DIR, file.name), contents[file.name]);
  audit('restore', {
    to: plan.manifest.version,
    files: plan.changed.map(file => ({ name: file.name, lines: file.changes.length })),
  });
  const after = planRestore();
  if (after.changed.length !== 0) fail('되돌린 뒤에도 검증한 사본과 다릅니다.');
  console.log(`시험 정책을 ${plan.manifest.version} 으로 되돌렸습니다. 감사 기록에 남겼습니다.`);
  await check();
}

// 시험 정책의 판정기로 두 요청을 확인한다: B의 다른 사람 자료(메모 전체 목록) 요청은 거부, A의 정상 메모 조회는 허용.
// 메모 주인 비교는 자료 API가 하므로, 판정기 단계에서는 다른 사람 자료로 이어지는 목록 경로가 막히는지 본다.
async function check() {
  verifySafeCopy();
  const testDecider = join(TEST_DIR, 'decider.mjs');
  if (!existsSync(testDecider)) fail('시험 정책 판정기(backup/policy-test/decider.mjs)가 없습니다.');
  // 사본 판정기가 쓰는 구역 표는 저장소의 src/resources.mjs 를 그대로 가리키게 한 임시 파일로 불러온다.
  const resourcesUrl = pathToFileURL(join(root, 'src', 'resources.mjs')).href;
  const text = readFileSync(testDecider, 'utf8').replace("from './resources.mjs'", `from '${resourcesUrl}'`);
  const temp = join(tmpdir(), `policy-test-decider-${process.pid}-${Date.now()}.mjs`);
  writeFileSync(temp, text);
  const { decide } = await import(pathToFileURL(temp).href);
  const { fixtureRequests } = await import(pathToFileURL(join(root, 'scripts', 'fixture-7.mjs')).href);
  const { normal } = fixtureRequests();
  const cases = [
    { name: 'B가 다른 사람 메모 전체 목록을 요청 (GET /notes)', expected: 'deny',
      request: { ...normal, path: '/notes', route: 'GET /notes' } },
    { name: 'A의 정상 메모 하나 조회 (GET /notes/:id)', expected: 'allow',
      request: { ...normal } },
  ];
  let ok = true;
  for (const item of cases) {
    const result = await decide(item.request);
    const passed = result.decision === item.expected;
    ok = ok && passed;
    console.log(`${passed ? '통과' : '확인 필요'} · ${item.name} → ${result.decision} (${result.reasonCode})`);
  }
  console.log('시험 정책 사본으로 확인한 로컬 결과이며, 실제 배포나 심판 판정이 아닙니다.');
  if (!ok) process.exitCode = 1;
}

const command = process.argv[2];
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (command === 'snapshot') snapshot({ replace: process.argv.includes('--replace') });
    else if (command === 'simulate') simulate();
    else if (command === 'diff') diff();
    else if (command === 'restore') await restore({ confirmed: process.argv.includes('--yes') });
    else if (command === 'check') await check();
    else {
      console.log('사용법: node scripts/policy-backup.mjs <snapshot|simulate|diff|restore|check>');
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
