import { apiError, authenticate, serverEnv } from '../../src/server-auth.mjs';
import { checkDeviceSignature, createDeviceStore } from '../../src/device-signature.mjs';

// 11단계 기기 상태 확인: GET /api/device/status
// 이 기기의 서명으로 요청해야 하며, 서버가 등록 기기인지 확인한 결과만 돌려준다. 화면은 이 결과가 true 일 때만 자료실을 연다.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return apiError(response, 405, 'METHOD_NOT_ALLOWED');
  }
  const env = serverEnv();
  if (!env) return apiError(response, 500, 'DEVICE_UNAVAILABLE');
  const identity = await authenticate(request, response, env);
  if (!identity) return undefined;
  const check = await checkDeviceSignature(request, identity, createDeviceStore(env.baseUrl, env.secretKey));
  if (!check.ok) {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    return response.status(check.status).json({ registered: false, error: check.error, ...(check.message ? { message: check.message } : {}) });
  }
  return response.status(200).json({ registered: true, deviceId: check.deviceId });
}
