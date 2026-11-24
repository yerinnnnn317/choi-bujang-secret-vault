// 12단계: 1~11단계의 정상·금지 요청을 실제로 실행해 한 표로 남긴다.
// - 로컬: 학생 판정기(src/decider.mjs)·탐지기(src/detect.mjs)·안전 정책 사본을 직접 실행한 결과
// - 배포: publicAppUrl 에 실제로 보낸 HTTP 요청의 상태 코드와 Vercel 요청 ID(x-vercel-id)
// - 미실행: 시험 계정 토큰·승인된 기기 키가 필요한 요청과 심판의 41종 공격. 결과를 지어내지 않고 미실행으로 남긴다.
// 비밀값·토큰은 쓰지 않으며 메모 본문은 기록하지 않는다.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from '../src/decider.mjs';
import { detect } from '../src/detect.mjs';
import { fixtureRequests } from './fixture-7.mjs';
import { planRestore } from './policy-backup.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(resolve(root, 'aleph.config.json'), 'utf8'));
const app = process.env.ALEPH_CHECK_URL ?? config.publicAppUrl;
const rows = [];
const now = () => new Date().toISOString();

function add(row) {
  rows.push({ checkedAt: now(), ...row });
}

// ---- 로컬 실측: 판정기 ----
const { normal, suspicious } = fixtureRequests();
const withId = request => ({ ...request, requestId: randomUUID() });
async function decideRow(step, kind, name, request, expected) {
  const req = withId(request);
  const result = await decide(req);
  const actual = `${result.decision} · ${result.reasonCode}`;
  add({ step, kind, name, where: '로컬 판정기', expected, actual, requestId: result.requestId,
    status: actual === expected ? '통과' : '불일치' });
}
await decideRow(6, '정상', '등록 기기의 메모 하나 조회', normal, 'allow · approved');
await decideRow(6, '금지', '미등록 기기의 요청', { ...normal, deviceRegistered: false }, 'deny · device_not_registered');
await decideRow(7, '정상', '지역만 다른 요청', { ...normal, signals: { ...normal.signals, region: 'foreign' } }, 'allow · approved');
await decideRow(7, '금지', '평소와 다른 시각·낯선 네트워크·다량 읽기 복합 사건', suspicious, 'step_up · step_up_required');
await decideRow(8, '정상', '반 공지 읽기 GET /announcements/:id',
  { ...normal, service: 'announcements', path: '/announcements/a1', route: 'GET /announcements/:id' }, 'allow · approved');
await decideRow(8, '금지', 'ID 없는 메모 전체 목록 GET /notes', { ...normal, path: '/notes', route: 'GET /notes' }, 'deny · route_not_allowed');
await decideRow(8, '금지', '반 공지 수정 PUT /announcements/:id',
  { ...normal, service: 'announcements', method: 'PUT', path: '/announcements/a1', route: 'PUT /announcements/:id' }, 'deny · route_not_allowed');
await decideRow(8, '금지', '강사 자료 조회',
  { ...normal, service: 'instructor', path: '/instructor/materials/m1', route: 'GET /instructor/materials/:id' }, 'deny · route_not_allowed');

// ---- 로컬 실측: 탐지기 ----
const start = Date.UTC(2026, 9, 1);
const reads = (n, sub, gapSec) => Array.from({ length: n }, (_, i) => ({
  at: new Date(start + i * gapSec * 1000).toISOString(), method: 'GET', identity: { sub },
}));
for (const [kind, name, events, expected] of [
  ['정상', '10분 안 조회 120건', reads(120, 'sub-a', 2), 'observe'],
  ['금지', '10분 안 조회 121건', reads(121, 'sub-a', 2), 'propose_revocation · burst_read'],
]) {
  const result = detect(events);
  const actual = result.action === 'observe' ? 'observe' : `${result.action} · ${result.reasonCode}`;
  add({ step: 9, kind, name, where: '로컬 탐지기', expected, actual, requestId: `local-${randomUUID()}`,
    status: actual === expected ? '통과' : '불일치' });
}

// ---- 로컬 실측: 안전 정책 사본 ----
try {
  const plan = planRestore();
  const actual = plan.changed.length === 0 ? `차이 없음 (${plan.manifest.version})` : `차이 ${plan.changed.length}개 파일`;
  add({ step: 10, kind: '정상', name: '시험 정책이 검증한 안전 정책 사본과 같음', where: '로컬 사본',
    expected: `차이 없음 (${plan.manifest.version})`, actual, requestId: `local-${randomUUID()}`,
    status: plan.changed.length === 0 ? '통과' : '불일치' });
} catch (error) {
  add({ step: 10, kind: '정상', name: '시험 정책이 검증한 안전 정책 사본과 같음', where: '로컬 사본',
    expected: '차이 없음', actual: error.message, requestId: `local-${randomUUID()}`, status: '불일치' });
}

// ---- 배포 실측: 실제 HTTP 요청 ----
async function httpRow(step, kind, name, method, path, expectedStatuses, init = {}) {
  const expected = expectedStatuses.join(' 또는 ');
  try {
    const response = await fetch(new URL(path, app), {
      method, redirect: 'manual', signal: AbortSignal.timeout(10000), cache: 'no-store', ...init,
    });
    const requestId = response.headers.get('x-vercel-id') ?? '응답에 요청 ID 없음';
    add({ step, kind, name, where: `배포 ${method} ${path}`, expected, actual: String(response.status), requestId,
      status: expectedStatuses.includes(response.status) ? '통과' : '불일치' });
  } catch (error) {
    add({ step, kind, name, where: `배포 ${method} ${path}`, expected, actual: `요청 실패 (${error.name})`,
      requestId: '-', status: '불일치' });
  }
}
const json = body => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
await httpRow(2, '정상', '자료실 첫 화면 열기', 'GET', '/', [200]);
await httpRow(3, '금지', '로그인 없이 메모 목록 조회', 'GET', '/api/notes', [401]);
await httpRow(4, '금지', '위조 토큰으로 메모 목록 조회', 'GET', '/api/notes', [401],
  { headers: { Authorization: 'Bearer fake-token-for-regression-check' } });
await httpRow(8, '금지', '로그인 없이 반 공지 수정', 'PUT', '/api/announcements/sample-announcement', [401, 403], json({ role: 'instructor' }));
await httpRow(10, '금지', '로그인 없이 메모 복원', 'POST', '/api/restore/notes/20000000-0000-4000-8000-0000000000b1', [401, 403]);
await httpRow(11, '정상', '설치형 앱 설정 내려받기', 'GET', '/manifest.webmanifest', [200]);
await httpRow(11, '금지', '로그인 없이 기기 승인 요청', 'POST', '/api/device/approve', [401, 403], json({}));
await httpRow(12, '금지', '로그인 없이 작전실 요약 조회', 'GET', '/api/ops/summary', [401, 403]);

// ---- 미실행: 토큰·승인 기기 키가 필요한 요청과 심판 41종 ----
for (const [step, kind, name, expected] of [
  [3, '정상', '로그인·승인 기기로 내 메모 목록 조회', '200'],
  [4, '금지', 'B가 A의 메모 조회·수정·삭제', '403 NOTE_FORBIDDEN'],
  [10, '정상', 'B가 자기 메모를 변조·삭제 뒤 복원', '200 restored, ID·소유자·해시 일치'],
  [11, '금지', '토큰은 있지만 기기 서명 없는 보호 요청', '403 DEVICE_SIGNATURE_REQUIRED'],
  [11, '금지', '서명 뒤 경로 변경', '403 SIGNATURE_MISMATCH'],
  [11, '금지', '서명 뒤 수정 본문 변경', '403 SIGNATURE_MISMATCH'],
  [12, '금지', '심판의 1~12단계 41종 공격', '심판 판정'],
]) {
  add({ step, kind, name, where: '미실행', expected, actual: '미실행 — 시험 계정 토큰·승인 기기 키가 필요해 자기 점검에서 보내지 않음',
    requestId: '-', status: '미실행' });
}

// ---- 표 출력 ----
const escape = value => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const header = '| 단계 | 구분 | 요청 | 실행 위치 | 기대 결과 | 실제 결과 | 요청 ID | 확인 시각 | 판정 |\n|---|---|---|---|---|---|---|---|---|';
const lines = rows.map(r => `| ${r.step} | ${r.kind} | ${escape(r.name)} | ${escape(r.where)} | ${escape(r.expected)} | ${escape(r.actual)} | ${escape(r.requestId)} | ${r.checkedAt} | ${r.status} |`);
const count = s => rows.filter(r => r.status === s).length;
const summary = `실행 ${rows.length - count('미실행')}건 (통과 ${count('통과')}, 불일치 ${count('불일치')}) · 미실행 ${count('미실행')}건`;
const markdown = `# 1~12단계 정상·금지 요청 실측표\n\n`
  + `- 대상 배포 주소: ${app}\n- 생성 시각: ${now()}\n- 요약: ${summary}\n`
  + `- 「미실행」은 통과로 세지 않습니다. 심판의 41종 공격 결과는 이 표에 포함되지 않습니다.\n\n${header}\n${lines.join('\n')}\n`;
mkdirSync(resolve(root, 'reports'), { recursive: true });
writeFileSync(resolve(root, 'reports', 'regression-table.md'), markdown);
console.log(markdown);
if (count('불일치') > 0) process.exitCode = 1;
