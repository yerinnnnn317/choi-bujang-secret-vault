import { randomUUID } from 'node:crypto';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';
import { resourceId } from '../src/resources.mjs';
import { noteContentSha256 } from '../src/note-backup.mjs';
import { checkDeviceSignature, createDeviceStore } from '../src/device-signature.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
let verifyLoginAuthorization;

function parseBody(body) {
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
}

function noteFields(body) {
  if (typeof body?.title !== 'string' || !body.title.trim()
      || typeof body?.body !== 'string' || !body.body.trim()) return null;
  return { title: body.title, content: body.body };
}

function apiError(response, status, error, message) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  return response.status(status).json({ error, ...(message ? { message } : {}) });
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  const url = new URL(request.url, 'https://local.invalid');
  const match = /^\/api\/notes(?:\/([^/]+))?\/?$/u.exec(url.pathname);
  if (!match) return apiError(response, 404, 'NOT_FOUND');
  let id;
  try {
    id = match[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return apiError(response, 400, 'INVALID_ID');
  }
  if (id && !UUID.test(id)) return apiError(response, 400, 'INVALID_ID');

  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) {
    response.setHeader('Allow', id ? 'GET, PUT, DELETE' : 'GET, POST');
    return apiError(response, 405, 'METHOD_NOT_ALLOWED');
  }
  if ((!id && !['GET', 'POST'].includes(request.method))
      || (id && !['GET', 'PUT', 'DELETE'].includes(request.method))) {
    return apiError(response, 404, 'NOT_FOUND');
  }

  const authorization = request.headers?.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return apiError(response, 401, 'UNAUTHORIZED', '유효한 로그인 토큰이 필요합니다.');
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey || !URL.canParse(supabaseUrl)) {
    return apiError(response, 500, 'NOTES_UNAVAILABLE');
  }
  const baseUrl = new URL(supabaseUrl);
  if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password
      || baseUrl.search || baseUrl.hash || baseUrl.pathname !== '/') {
    return apiError(response, 500, 'NOTES_UNAVAILABLE');
  }

  const deploymentHost = process.env.VERCEL_URL;
  const verifierConfig = deploymentHost
    ? { ...config, publicAppUrl: `https://${deploymentHost}/` }
    : config;
  if (!verifyLoginAuthorization) {
    try {
      verifyLoginAuthorization = createLoginVerifier({
        config: verifierConfig,
        supabaseSecretKey: secretKey,
      });
    } catch {
      return apiError(response, 500, 'NOTES_UNAVAILABLE');
    }
  }
  let identity;
  try {
    identity = await verifyLoginAuthorization(authorization);
  } catch {
    return apiError(response, 401, 'UNAUTHORIZED', '로그인 토큰을 확인할 수 없습니다.');
  }
  if (!identity) {
    return apiError(response, 401, 'UNAUTHORIZED', '로그인 토큰을 확인할 수 없습니다.');
  }
  // 11단계: 보호 요청은 승인된 기기의 서명이 있어야 한다(서명 없음·경로/본문 변경·미승인 기기는 403).
  const deviceCheck = await checkDeviceSignature(request, identity, createDeviceStore(baseUrl, secretKey));
  if (!deviceCheck.ok) return apiError(response, deviceCheck.status, deviceCheck.error, deviceCheck.message);

  const notesUrl = new URL('/rest/v1/training_notes', baseUrl);
  notesUrl.searchParams.set('select', 'id,title,content');
  const headers = {
    apikey: secretKey,
    Authorization: 'Bearer ' + secretKey,
  };
  if (id) {
    const ownerCheckUrl = new URL(notesUrl);
    ownerCheckUrl.searchParams.set('select', 'owner_id');
    ownerCheckUrl.searchParams.set('id', `eq.${id}`);

    let ownerCheck;
    try {
      ownerCheck = await fetch(ownerCheckUrl, {
        headers,
        cache: 'no-store',
      });
    } catch {
      return apiError(response, 502, 'NOTES_UNAVAILABLE');
    }
    if (!ownerCheck.ok) return apiError(response, 502, 'NOTES_UNAVAILABLE');

    let existingRows;
    try {
      existingRows = await ownerCheck.json();
    } catch {
      return apiError(response, 502, 'NOTES_UNAVAILABLE');
    }
    if (!Array.isArray(existingRows)) return apiError(response, 502, 'NOTES_UNAVAILABLE');
    if (!existingRows.length) return apiError(response, 404, 'NOT_FOUND');
    if (existingRows[0].owner_id !== identity.userId) {
      return apiError(response, 403, 'NOTE_FORBIDDEN',
        '이 메모의 소유자가 아니므로 조회·수정·삭제할 수 없습니다.');
    }
  }

  let method = request.method;
  let body;

  if (!id && method === 'GET') {
    notesUrl.searchParams.set('owner_id', `eq.${identity.userId}`);
    notesUrl.searchParams.set('order', 'created_at.desc');
  } else if (!id && method === 'POST') {
    const input = parseBody(request.body);
    const fields = noteFields(input);
    if (!fields || (input.id !== undefined && (typeof input.id !== 'string' || !UUID.test(input.id)))) {
      return apiError(response, 400, 'INVALID_NOTE');
    }
    body = { id: input.id ?? randomUUID(), owner_id: identity.userId, ...fields };
    headers.Prefer = 'return=minimal';
  } else {
    notesUrl.searchParams.set('id', `eq.${id}`);
    notesUrl.searchParams.set('owner_id', `eq.${identity.userId}`);
    if (method === 'GET') {
      headers.Accept = 'application/json';
    } else if (method === 'PUT') {
      const fields = noteFields(parseBody(request.body));
      if (!fields) return apiError(response, 400, 'INVALID_NOTE');
      method = 'PATCH';
      body = fields;
      headers.Prefer = 'return=representation';
    } else {
      method = 'DELETE';
      notesUrl.searchParams.set('select', 'id');
      headers.Prefer = 'return=representation';
    }
  }

  let result;
  try {
    result = await fetch(notesUrl, {
      method: method === 'POST' ? 'POST' : method,
      headers: {
        ...headers,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
  } catch {
    return apiError(response, 502, 'NOTES_UNAVAILABLE');
  }

  if (!result.ok) {
    return apiError(response, 502, 'NOTES_UNAVAILABLE');
  }
  if (request.method === 'POST') {
    // 10단계: 처음 만든 메모의 비공개 사본을 서버 전용 표에 남긴다(같은 ID는 처음 사본만 유지).
    // 사본 저장에 실패해도 메모 생성은 그대로 두고, 복원 경로가 사본 없음으로 멈춘다.
    try {
      const backupUrl = new URL('/rest/v1/training_notes_backup', baseUrl);
      backupUrl.searchParams.set('on_conflict', 'id');
      await fetch(backupUrl, {
        method: 'POST',
        headers: {
          apikey: secretKey,
          Authorization: 'Bearer ' + secretKey,
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify({
          id: body.id,
          owner_id: body.owner_id,
          title: body.title,
          content: body.content,
          content_sha256: noteContentSha256(body.title, body.content),
        }),
        cache: 'no-store',
      });
    } catch {
      // 사본 저장 실패는 응답에 섞지 않는다.
    }
    return response.status(201).json({ id: body.id, resourceId: resourceId('note', body.id) });
  }

  let rows;
  try {
    rows = await result.json();
  } catch {
    return apiError(response, 502, 'NOTES_UNAVAILABLE');
  }
  if (!Array.isArray(rows)) return apiError(response, 502, 'NOTES_UNAVAILABLE');

  if (!id) {
    if (rows.some(row => typeof row.id !== 'string'
        || typeof row.title !== 'string' || typeof row.content !== 'string')) {
      return apiError(response, 502, 'NOTES_UNAVAILABLE');
    }
    return response.status(200).json(rows.map(({ id: noteId, title, content }) => ({
      id: noteId, resourceId: resourceId('note', noteId), title, body: content,
    })));
  }
  if (!rows.length) return apiError(response, 404, 'NOT_FOUND');

  if (request.method === 'GET') {
    const [row] = rows;
    if (typeof row.title !== 'string' || typeof row.content !== 'string') {
      return apiError(response, 502, 'NOTES_UNAVAILABLE');
    }
    return response.status(200).json({
      id: row.id, resourceId: resourceId('note', row.id), title: row.title, body: row.content,
    });
  }
  if (request.method === 'PUT') return response.status(200).json({ id, resourceId: resourceId('note', id) });
  return response.status(204).end();
}
