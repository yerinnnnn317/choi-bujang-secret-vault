// 11단계 기기 API 공통: 서버 환경 확인과 로그인 토큰 검증. 실패하면 null 과 함께 이미 응답을 보낸다.
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';

let verifyLoginAuthorization;

export function apiError(response, status, error, message) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  return response.status(status).json({ error, ...(message ? { message } : {}) });
}

export function serverEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey || !URL.canParse(supabaseUrl)) return null;
  const baseUrl = new URL(supabaseUrl);
  if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password
      || baseUrl.search || baseUrl.hash || baseUrl.pathname !== '/') return null;
  return { baseUrl, secretKey };
}

export async function authenticate(request, response, env) {
  const authorization = request.headers?.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    apiError(response, 401, 'UNAUTHORIZED', '유효한 로그인 토큰이 필요합니다.');
    return null;
  }
  const deploymentHost = process.env.VERCEL_URL;
  const verifierConfig = deploymentHost ? { ...config, publicAppUrl: `https://${deploymentHost}/` } : config;
  if (!verifyLoginAuthorization) {
    try {
      verifyLoginAuthorization = createLoginVerifier({ config: verifierConfig, supabaseSecretKey: env.secretKey });
    } catch {
      apiError(response, 500, 'DEVICE_UNAVAILABLE');
      return null;
    }
  }
  let identity = null;
  try {
    identity = await verifyLoginAuthorization(authorization);
  } catch {
    identity = null;
  }
  if (!identity) apiError(response, 401, 'UNAUTHORIZED', '로그인 토큰을 확인할 수 없습니다.');
  return identity;
}
