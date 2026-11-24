import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';
import { resourceId } from '../src/resources.mjs';
import { checkDeviceSignature, createDeviceStore } from '../src/device-signature.mjs';

// 8단계 반 공지 API: 검증된 로그인 사용자만 읽을 수 있고, 쓰기는 서버에 저장된 강사 권한이 있을 때만 허용한다.
// 화면 메뉴, 요청 본문의 role, 토큰 안의 임의 값은 강사 권한으로 믿지 않는다.
// 아직 서버에 강사 권한 저장소와 공지 저장소가 없으므로, 지금은 모든 쓰기를 거부하고 읽기는 빈 목록을 돌려준다.
// 강사의 공지 수정은 이 학생용 API가 아니라 별도의 서버 관리 경로에서 처리한다.
let verifyLoginAuthorization;

function apiError(response, status, error, message) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  return response.status(status).json({ error, ...(message ? { message } : {}) });
}

// 서버에 저장된 강사 권한만 인정한다. 현재 저장된 강사 권한이 없으므로 항상 false.
function hasStoredInstructorPermission(_identity) {
  return false;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  const url = new URL(request.url, 'https://local.invalid');
  const match = /^\/api\/announcements(?:\/([^/]+))?\/?$/u.exec(url.pathname);
  if (!match) return apiError(response, 404, 'NOT_FOUND');
  let id;
  try {
    id = match[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return apiError(response, 400, 'INVALID_ID');
  }
  if (id !== null && (id.length === 0 || id.includes(':'))) return apiError(response, 400, 'INVALID_ID');

  const authorization = request.headers?.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return apiError(response, 401, 'UNAUTHORIZED', '유효한 로그인 토큰이 필요합니다.');
  }

  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!secretKey || !supabaseUrl || !URL.canParse(supabaseUrl)) return apiError(response, 500, 'ANNOUNCEMENTS_UNAVAILABLE');
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
      return apiError(response, 500, 'ANNOUNCEMENTS_UNAVAILABLE');
    }
  }
  let identity;
  try {
    identity = await verifyLoginAuthorization(authorization);
  } catch {
    identity = null;
  }
  if (!identity) {
    return apiError(response, 401, 'UNAUTHORIZED', '로그인 토큰을 확인할 수 없습니다.');
  }
  // 11단계: 보호 요청은 승인된 기기의 서명이 있어야 한다(서명 없음·경로/본문 변경·미승인 기기는 403).
  const deviceCheck = await checkDeviceSignature(request, identity, createDeviceStore(new URL(supabaseUrl), secretKey));
  if (!deviceCheck.ok) return apiError(response, deviceCheck.status, deviceCheck.error, deviceCheck.message);

  if (request.method === 'GET') {
    // 공지 저장소가 아직 없으므로 읽을 공지가 없다.
    if (id) return apiError(response, 404, 'NOT_FOUND');
    return response.status(200).json([]);
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    // 강사 권한이 저장돼 있더라도 이 학생용 API에서는 공지를 바꾸지 않는다(강사 관리 경로에서 처리).
    const reason = hasStoredInstructorPermission(identity)
      ? '공지 수정은 강사 관리 경로에서만 처리합니다.'
      : '반 공지는 읽기만 할 수 있습니다. 저장된 강사 권한이 없습니다.';
    return apiError(response, 403, 'ANNOUNCEMENT_FORBIDDEN',
      id ? `${resourceId('announcement', id)}: ${reason}` : reason);
  }

  response.setHeader('Allow', 'GET');
  return apiError(response, 405, 'METHOD_NOT_ALLOWED');
}
