import { randomUUID } from 'node:crypto';
import config from '../../aleph.config.json' with { type: 'json' };
import policyManifest from '../../backup/policy/manifest.json' with { type: 'json' };
import { RULE_IDS } from '../../src/decider.mjs';
import { apiError, authenticate, serverEnv } from '../../src/server-auth.mjs';
import { checkDeviceSignature, createDeviceStore } from '../../src/device-signature.mjs';

// 12단계 탈환 작전실 요약: GET /api/ops/summary
// 로그인 + 승인된 기기 서명이 있어야 한다. 로그인한 본인의 기록만 읽고, ID는 앞 8자리만 보여 주며 메모 본문은 돌려주지 않는다.
// 각 항목은 실제 서버 기록에서 확인한 것(confirmed)·읽지 못한 것(unavailable)·실행하지 않은 것(not_run)을 구분한다.
const mask = value => (typeof value === 'string' && value.length > 8 ? `${value.slice(0, 8)}…` : String(value ?? ''));

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return apiError(response, 405, 'METHOD_NOT_ALLOWED');
  }
  const env = serverEnv();
  if (!env) return apiError(response, 500, 'OPS_UNAVAILABLE');
  const identity = await authenticate(request, response, env);
  if (!identity) return undefined;
  const deviceCheck = await checkDeviceSignature(request, identity, createDeviceStore(env.baseUrl, env.secretKey));
  if (!deviceCheck.ok) return apiError(response, deviceCheck.status, deviceCheck.error, deviceCheck.message);

  const headers = { apikey: env.secretKey, Authorization: 'Bearer ' + env.secretKey };
  const read = async (table, params) => {
    const url = new URL(`/rest/v1/${table}`, env.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const result = await fetch(url, { headers, cache: 'no-store' });
    if (!result.ok) throw new Error(`${table}_${result.status}`);
    const rows = await result.json();
    if (!Array.isArray(rows)) throw new Error(`${table}_shape`);
    return rows;
  };
  const section = async (load) => {
    try {
      return { status: 'confirmed', ...(await load()) };
    } catch (error) {
      return { status: 'unavailable', reason: `서버 기록을 읽지 못했습니다 (${error.message})` };
    }
  };
  const owner = `eq.${identity.userId}`;

  const [devices, backups, restores] = await Promise.all([
    section(async () => {
      const rows = await read('device_approvals', { select: 'device_id,status,approved_at', owner_id: owner, order: 'approved_at.desc' });
      return {
        approved: rows.filter(r => r.status === 'approved').length,
        revoked: rows.filter(r => r.status === 'revoked').length,
        records: rows.map(r => ({ deviceId: mask(r.device_id), status: r.status, at: r.approved_at })),
      };
    }),
    section(async () => {
      const rows = await read('training_notes_backup', { select: 'id,backed_up_at', owner_id: owner, order: 'backed_up_at.desc' });
      return { count: rows.length, records: rows.map(r => ({ noteId: mask(r.id), at: r.backed_up_at })) };
    }),
    section(async () => {
      const rows = await read('training_notes_restore_audit', {
        select: 'note_id,result,at', owner_id: owner, order: 'at.desc', limit: '20',
      });
      return {
        restored: rows.filter(r => r.result === 'restored').length,
        refused: rows.filter(r => r.result !== 'restored').length,
        records: rows.map(r => ({ noteId: mask(r.note_id), result: r.result, at: r.at })),
      };
    }),
  ]);

  return response.status(200).json({
    requestId: typeof request.headers?.['x-vercel-id'] === 'string' ? request.headers['x-vercel-id'] : randomUUID(),
    checkedAt: new Date().toISOString(),
    viewer: { kind: identity.kind, deviceId: mask(deviceCheck.deviceId) },
    decider: {
      status: 'confirmed',
      source: '배포된 src/decider.mjs 와 aleph.config.json',
      step: config.step,
      ruleIds: [...RULE_IDS],
      allowedRoutes: [...config.allowedRoutes],
    },
    detection: {
      status: 'not_run',
      rule: 'burst_read (같은 사용자 GET 10분 안 120건 초과 → propose_revocation)',
      reason: '반 엔진의 실제 사건 전달이 연결되지 않아 실제 탐지 사건이 없습니다. 규칙은 npm run detect:test 로 로컬 확인합니다.',
    },
    revocation: {
      devices,
      detectionRevocation: { status: 'not_run', reason: '탐지 결과로 기기를 회수하는 연결은 아직 실행하지 않았습니다.' },
    },
    recovery: {
      policy: {
        status: 'confirmed',
        source: '배포된 backup/policy/manifest.json',
        version: policyManifest.version,
        files: policyManifest.files.map(f => ({ name: f.name, sha256: `${f.sha256.slice(0, 12)}…` })),
      },
      noteBackups: backups,
      restoreAudit: restores,
    },
  });
}
