import config from '../../../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../../../src/verify-login.mjs';
import { resourceId } from '../../../src/resources.mjs';
import { noteContentSha256 } from '../../../src/note-backup.mjs';
import { checkDeviceSignature, createDeviceStore } from '../../../src/device-signature.mjs';

// 10단계 복원 경로: POST /api/restore/notes/:id
// 비공개 사본(training_notes_backup)에서 메모 한 건만 되돌린다. 다른 메모와 감사 기록은 건드리지 않는다.
// 대조: 사본의 내용 해시 → 사본 소유자와 검증된 로그인 사용자 → 현재 행의 소유자 → 복원 뒤 ID·소유자·해시.
// 화면 메뉴·요청 본문의 role·owner 값은 믿지 않고, 하나라도 맞지 않으면 바꾸지 않고 멈춘다.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
let verifyLoginAuthorization;

function apiError(response, status, error, message) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  return response.status(status).json({ error, ...(message ? { message } : {}) });
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  const url = new URL(request.url, 'https://local.invalid');
  const match = /^\/api\/restore\/notes\/([^/]+)\/?$/u.exec(url.pathname);
  if (!match) return apiError(response, 404, 'NOT_FOUND');
  let id;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return apiError(response, 400, 'INVALID_ID');
  }
  if (!UUID.test(id)) return apiError(response, 400, 'INVALID_ID');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return apiError(response, 405, 'METHOD_NOT_ALLOWED');
  }

  const authorization = request.headers?.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return apiError(response, 401, 'UNAUTHORIZED', '유효한 로그인 토큰이 필요합니다.');
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey || !URL.canParse(supabaseUrl)) {
    return apiError(response, 500, 'RESTORE_UNAVAILABLE');
  }
  const baseUrl = new URL(supabaseUrl);
  if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password
      || baseUrl.search || baseUrl.hash || baseUrl.pathname !== '/') {
    return apiError(response, 500, 'RESTORE_UNAVAILABLE');
  }
  const deploymentHost = process.env.VERCEL_URL;
  const verifierConfig = deploymentHost ? { ...config, publicAppUrl: `https://${deploymentHost}/` } : config;
  if (!verifyLoginAuthorization) {
    try {
      verifyLoginAuthorization = createLoginVerifier({ config: verifierConfig, supabaseSecretKey: secretKey });
    } catch {
      return apiError(response, 500, 'RESTORE_UNAVAILABLE');
    }
  }
  let identity;
  try {
    identity = await verifyLoginAuthorization(authorization);
  } catch {
    identity = null;
  }
  if (!identity) return apiError(response, 401, 'UNAUTHORIZED', '로그인 토큰을 확인할 수 없습니다.');
  // 11단계: 보호 요청은 승인된 기기의 서명이 있어야 한다(서명 없음·경로/본문 변경·미승인 기기는 403).
  const deviceCheck = await checkDeviceSignature(request, identity, createDeviceStore(baseUrl, secretKey));
  if (!deviceCheck.ok) return apiError(response, deviceCheck.status, deviceCheck.error, deviceCheck.message);

  const headers = { apikey: secretKey, Authorization: 'Bearer ' + secretKey };
  const rest = async (path, params, init = {}) => {
    const target = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
    const result = await fetch(target, {
      ...init,
      headers: { ...headers, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
      cache: 'no-store',
    });
    if (!result.ok) throw new Error(`rest_${result.status}`);
    const text = await result.text();
    return text ? JSON.parse(text) : null;
  };
  const audit = async (row, result) => {
    // 감사 기록은 덧붙이기만 한다. 기록 실패가 복원 결과를 바꾸지는 않는다.
    try {
      await rest('/rest/v1/training_notes_restore_audit', {}, {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          note_id: id, owner_id: row.owner_id, content_sha256: row.content_sha256, action: 'restore_note', result,
        }),
      });
    } catch {
      // 무시
    }
  };

  try {
    // 1. 사본을 다시 읽어 검증한다.
    const backups = await rest('/rest/v1/training_notes_backup', {
      select: 'id,owner_id,title,content,content_sha256', id: `eq.${id}`,
    });
    if (!Array.isArray(backups) || backups.length === 0) {
      return apiError(response, 404, 'RESTORE_SOURCE_MISSING', '이 메모의 검증한 사본이 없어 복원하지 않습니다.');
    }
    const backup = backups[0];
    if (backup.id !== id || noteContentSha256(backup.title, backup.content) !== backup.content_sha256) {
      return apiError(response, 409, 'BACKUP_HASH_MISMATCH', '사본의 내용 해시가 맞지 않아 복원을 중단합니다.');
    }
    // 2. 사본 소유자와 검증된 로그인 사용자가 같아야 한다.
    if (backup.owner_id !== identity.userId) {
      return apiError(response, 403, 'RESTORE_FORBIDDEN', '이 메모의 소유자만 복원할 수 있습니다.');
    }
    // 3. 현재 행이 다른 사용자 소유라면 덮어쓰지 않는다.
    const current = await rest('/rest/v1/training_notes', { select: 'id,owner_id', id: `eq.${id}` });
    if (!Array.isArray(current)) throw new Error('rest_shape');
    if (current.length && current[0].owner_id !== backup.owner_id) {
      await audit(backup, 'refused_owner_mismatch');
      return apiError(response, 409, 'RESTORE_OWNER_CONFLICT', '현재 메모의 소유자가 사본과 달라 복원하지 않습니다.');
    }
    // 4. 그 한 건만 되돌린다: 변조됐으면 제목·내용만 고치고, 삭제됐으면 같은 ID·소유자로 다시 넣는다.
    if (current.length) {
      await rest('/rest/v1/training_notes', { id: `eq.${id}`, owner_id: `eq.${backup.owner_id}` }, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ title: backup.title, content: backup.content }),
      });
    } else {
      await rest('/rest/v1/training_notes', {}, {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ id, owner_id: backup.owner_id, title: backup.title, content: backup.content }),
      });
    }
    // 5. 복원 뒤 ID·소유자·내용 해시가 사본과 같은지 다시 읽어 확인한다.
    const after = await rest('/rest/v1/training_notes', { select: 'id,owner_id,title,content', id: `eq.${id}` });
    const row = Array.isArray(after) ? after[0] : null;
    const verified = Boolean(row) && row.id === id && row.owner_id === backup.owner_id
      && noteContentSha256(row.title, row.content) === backup.content_sha256;
    await audit(backup, verified ? 'restored' : 'verify_failed');
    if (!verified) return apiError(response, 500, 'RESTORE_VERIFY_FAILED', '복원 뒤 사본과 일치하지 않습니다.');
    return response.status(200).json({
      id, resourceId: resourceId('note', id), restored: true,
      idMatches: true, ownerMatches: true, contentSha256: backup.content_sha256,
    });
  } catch {
    return apiError(response, 502, 'RESTORE_UNAVAILABLE');
  }
}
