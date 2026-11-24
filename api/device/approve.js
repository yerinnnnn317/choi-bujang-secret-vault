import { apiError, authenticate, serverEnv } from '../../src/server-auth.mjs';
import { approvalMessage, createDeviceStore, deviceIdFromJwk, isFresh, verifyEcdsa } from '../../src/device-signature.mjs';

// 11단계 기기 승인 요청: POST /api/device/approve
// 본문 { publicKeyJwk, signedAt, signature } — signature 는 기기 개인키로 "승인 버전·로그인 사용자·시각"에 서명한 값.
// 서버가 로그인 토큰과 기기 키 소유(서명)를 직접 확인한 뒤에만 등록 기기로 기록한다. 버튼을 눌렀다는 것만으로는 승인하지 않는다.
// 다른 계정에 등록된 기기나 회수된 기기는 다시 승인하지 않는다.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return apiError(response, 405, 'METHOD_NOT_ALLOWED');
  }
  const env = serverEnv();
  if (!env) return apiError(response, 500, 'DEVICE_UNAVAILABLE');
  const identity = await authenticate(request, response, env);
  if (!identity) return undefined;

  let input = request.body;
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch { input = null; }
  }
  const jwk = input?.publicKeyJwk;
  const deviceId = deviceIdFromJwk(jwk);
  if (!deviceId || typeof input?.signedAt !== 'string' || typeof input?.signature !== 'string') {
    return apiError(response, 400, 'INVALID_DEVICE_REQUEST', '기기 공개키와 서명이 필요합니다.');
  }
  if (!isFresh(input.signedAt)) {
    return apiError(response, 403, 'SIGNATURE_EXPIRED', '승인 요청 서명 시각이 맞지 않습니다.');
  }
  const message = approvalMessage({ userId: identity.userId, signedAt: input.signedAt });
  if (!(await verifyEcdsa(jwk, message, input.signature))) {
    return apiError(response, 403, 'DEVICE_PROOF_FAILED', '기기 키 소유를 확인하지 못했습니다.');
  }
  const store = createDeviceStore(env.baseUrl, env.secretKey);
  try {
    const existing = await store.find(deviceId);
    if (existing) {
      if (existing.owner_id !== identity.userId) {
        return apiError(response, 409, 'DEVICE_OWNED_BY_OTHER', '다른 계정에 등록된 기기입니다.');
      }
      if (existing.status !== 'approved') {
        return apiError(response, 403, 'DEVICE_REVOKED', '회수된 기기는 다시 승인하지 않습니다.');
      }
    } else {
      await store.approve({ deviceId, ownerId: identity.userId, jwk });
    }
  } catch {
    return apiError(response, 502, 'DEVICE_STORE_UNAVAILABLE');
  }
  return response.status(200).json({ deviceId, status: 'approved' });
}
