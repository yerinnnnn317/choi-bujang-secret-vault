// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (!Number.isInteger(config.step) || config.step < 2) {
    throw new Error('2단계 이후의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  }
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  const apiUrl = new URL('/api/notes', app);
  const anonymousResponse = await fetch(apiUrl, {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  const fakeTokenResponse = await fetch(apiUrl, {
    headers: { Authorization: 'Bearer invalid' },
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  const isJsonAuthDenial = async response => {
    if (![401, 403].includes(response.status)
        || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return false;
    }
    try {
      const body = await response.json();
      return typeof body?.error === 'string' && body.error.length > 0;
    } catch {
      return false;
    }
  };
  const anonymousDenied = await isJsonAuthDenial(anonymousResponse);
  const fakeTokenDenied = await isJsonAuthDenial(fakeTokenResponse);
  return [
    {
      attackId: 'anonymous_note_read',
      expected: '토큰이 없는 GET /api/notes 요청은 JSON 401 또는 403이어야 함',
      observed: anonymousDenied
        ? `비로그인 목록 요청이 JSON으로 거부됨 (HTTP ${anonymousResponse.status})`
        : `비로그인 목록 요청이 JSON 401/403으로 거부되지 않음 (HTTP ${anonymousResponse.status})`,
    },
    {
      attackId: 'fake_token_note_read',
      expected: '위조 토큰의 GET /api/notes 요청은 JSON 401 또는 403이어야 함',
      observed: fakeTokenDenied
        ? `위조 토큰 목록 요청이 JSON으로 거부됨 (HTTP ${fakeTokenResponse.status})`
        : `위조 토큰 목록 요청이 JSON 401/403으로 거부되지 않음 (HTTP ${fakeTokenResponse.status})`,
    },
  ];
}
