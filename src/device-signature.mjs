// 11단계: 기기 승인과 요청 서명 확인.
// 보호 요청은 승인된 기기의 개인키로 "버전·메서드·경로(쿼리 포함)·시각·본문 해시"에 서명해야 한다.
// 서명이 없거나, 서명한 뒤 경로·본문이 바뀌거나, 승인되지 않은 기기면 거부한다.
// 서버는 기기 공개키만 다루며 개인키·토큰을 저장하거나 기록하지 않는다.
import { createHash, webcrypto } from 'node:crypto';

export const SIGNATURE_VERSION = 'aleph-device-v1';
export const APPROVAL_VERSION = 'aleph-device-approve-v1';
export const MAX_SKEW_MS = 2 * 60 * 1000;
const DEVICE_ID = /^[0-9a-f]{16}$/u;
const B64URL = /^[A-Za-z0-9_-]+$/u;

export const sha256Hex = text => createHash('sha256').update(text, 'utf8').digest('hex');

// 서버가 받은 본문을 서명 때와 같은 글자로 되돌린다(JSON 본문은 JSON.stringify 결과로 서명한다).
export function bodyText(body) {
  if (body === undefined || body === null || body === '') return '';
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  return JSON.stringify(body);
}

export function canonicalRequest({ method, pathWithQuery, timestamp, bodyHash }) {
  return [SIGNATURE_VERSION, String(method).toUpperCase(), pathWithQuery, timestamp, bodyHash].join('\n');
}

export function approvalMessage({ userId, signedAt }) {
  return [APPROVAL_VERSION, userId, signedAt].join('\n');
}

function publicJwk(jwk) {
  if (!jwk || typeof jwk !== 'object' || jwk.kty !== 'EC' || jwk.crv !== 'P-256'
      || typeof jwk.x !== 'string' || typeof jwk.y !== 'string' || 'd' in jwk) return null;
  return { crv: 'P-256', kty: 'EC', x: jwk.x, y: jwk.y };
}

// 기기 ID: 공개키의 SHA-256 앞 16자리(소문자 16진수).
export function deviceIdFromJwk(jwk) {
  const key = publicJwk(jwk);
  return key ? sha256Hex(JSON.stringify(key)).slice(0, 16) : null;
}

export async function verifyEcdsa(jwk, message, signature) {
  const key = publicJwk(jwk);
  if (!key || typeof signature !== 'string' || !B64URL.test(signature)) return false;
  try {
    const cryptoKey = await webcrypto.subtle.importKey('jwk', key, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(message));
  } catch {
    return false;
  }
}

export function isFresh(timestamp, now = Date.now()) {
  if (typeof timestamp !== 'string' || !/^\d{13}$/u.test(timestamp)) return false;
  return Math.abs(now - Number(timestamp)) <= MAX_SKEW_MS;
}

// 서버 전용 표에서 승인된 기기를 읽는다.
export function createDeviceStore(baseUrl, secretKey) {
  const headers = { apikey: secretKey, Authorization: 'Bearer ' + secretKey };
  const table = () => new URL('/rest/v1/device_approvals', baseUrl);
  return {
    async find(deviceId) {
      const url = table();
      url.searchParams.set('select', 'device_id,owner_id,public_key_jwk,status');
      url.searchParams.set('device_id', `eq.${deviceId}`);
      const result = await fetch(url, { headers, cache: 'no-store' });
      if (!result.ok) throw new Error('device_store_unavailable');
      const rows = await result.json();
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    },
    async approve({ deviceId, ownerId, jwk }) {
      const url = table();
      const result = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ device_id: deviceId, owner_id: ownerId, public_key_jwk: publicJwk(jwk), status: 'approved' }),
        cache: 'no-store',
      });
      if (!result.ok) throw new Error('device_store_unavailable');
    },
  };
}

// 보호 요청의 기기 서명을 확인한다. 통과하면 { ok: true, deviceId }.
export async function checkDeviceSignature(request, identity, store) {
  const h = request.headers ?? {};
  const deviceId = h['x-device-id'];
  const timestamp = h['x-device-timestamp'];
  const signature = h['x-device-signature'];
  if (typeof deviceId !== 'string' || typeof timestamp !== 'string' || typeof signature !== 'string') {
    return { ok: false, status: 403, error: 'DEVICE_SIGNATURE_REQUIRED', message: '승인된 기기의 요청 서명이 필요합니다.' };
  }
  if (!DEVICE_ID.test(deviceId)) {
    return { ok: false, status: 403, error: 'DEVICE_NOT_APPROVED', message: '승인되지 않은 기기입니다.' };
  }
  if (!isFresh(timestamp)) {
    return { ok: false, status: 403, error: 'SIGNATURE_EXPIRED', message: '요청 서명 시각이 맞지 않습니다.' };
  }
  let device;
  try {
    device = await store.find(deviceId);
  } catch {
    return { ok: false, status: 502, error: 'DEVICE_STORE_UNAVAILABLE' };
  }
  if (!device || device.status !== 'approved' || device.owner_id !== identity.userId) {
    return { ok: false, status: 403, error: 'DEVICE_NOT_APPROVED', message: '이 계정의 승인된 기기가 아닙니다.' };
  }
  const url = new URL(request.url, 'https://local.invalid');
  const message = canonicalRequest({
    method: request.method, pathWithQuery: url.pathname + url.search, timestamp, bodyHash: sha256Hex(bodyText(request.body)),
  });
  if (!(await verifyEcdsa(device.public_key_jwk, message, signature))) {
    return { ok: false, status: 403, error: 'SIGNATURE_MISMATCH', message: '요청 서명이 경로·본문과 맞지 않습니다.' };
  }
  return { ok: true, deviceId };
}
