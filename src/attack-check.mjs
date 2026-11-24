// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (!Number.isInteger(config.step) || config.step < 2) {
    throw new Error('2단계 이후의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  }
  const checkUrl = process.env.ALEPH_CHECK_URL ?? config.publicAppUrl;
  const localCheck = process.env.ALEPH_CHECK_URL !== undefined;
  let app;
  try {
    app = new URL(checkUrl);
  } catch {
    throw new Error('점검 주소를 올바른 URL로 설정해 주세요.');
  }
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(app.hostname);
  if (app.username || app.password || app.search || app.hash || app.pathname !== '/'
      || (localCheck
        ? !['http:', 'https:'].includes(app.protocol) || !isLoopback
        : app.protocol !== 'https:' || app.hostname.endsWith('.example'))) {
    throw new Error(localCheck
      ? 'ALEPH_CHECK_URL은 localhost 또는 루프백 주소만 사용할 수 있습니다.'
      : 'aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
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
  // 8단계: 로그인하지 않은 공지 수정 요청이 다른 구역(반 공지) 쓰기로 이어지지 않는지 실제로 보낸다.
  const announcementWriteResponse = await fetch(new URL('/api/announcements/sample-announcement', app), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'SAMPLE', role: 'instructor' }),
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  const announcementWriteDenied = await isJsonAuthDenial(announcementWriteResponse);
  // 10단계: 로그인하지 않은 복원 요청은 어떤 메모도 되돌리지 못해야 한다(대상 ID는 README의 가상 메모).
  const restoreResponse = await fetch(new URL('/api/restore/notes/20000000-0000-4000-8000-0000000000b1', app), {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  const restoreDenied = await isJsonAuthDenial(restoreResponse);
  // 11단계: 로그인하지 않은 기기 승인 요청은 기기를 등록하지 못해야 한다.
  const deviceApproveResponse = await fetch(new URL('/api/device/approve', app), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKeyJwk: null, signedAt: '0', signature: 'invalid' }),
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  const deviceApproveDenied = await isJsonAuthDenial(deviceApproveResponse);
  // 12단계: 로그인하지 않은 작전실 요약 요청은 서버 기록을 읽지 못해야 한다.
  const opsResponse = await fetch(new URL('/api/ops/summary', app), {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  const opsDenied = await isJsonAuthDenial(opsResponse);
  return [
    {
      attackId: 'anonymous_note_read',
      expected: '토큰이 없는 GET /api/notes 요청은 JSON 401 또는 403이어야 함',
      observed: anonymousDenied
        ? `${localCheck ? '로컬 ' : ''}비로그인 목록 요청이 JSON으로 거부됨 (HTTP ${anonymousResponse.status})`
        : `${localCheck ? '로컬 ' : ''}비로그인 목록 요청이 JSON 401/403으로 거부되지 않음 (HTTP ${anonymousResponse.status})`,
    },
    {
      attackId: 'fake_token_note_read',
      expected: '위조 토큰의 GET /api/notes 요청은 JSON 401 또는 403이어야 함',
      observed: fakeTokenDenied
        ? `${localCheck ? '로컬 ' : ''}위조 토큰 목록 요청이 JSON으로 거부됨 (HTTP ${fakeTokenResponse.status})`
        : `${localCheck ? '로컬 ' : ''}위조 토큰 목록 요청이 JSON 401/403으로 거부되지 않음 (HTTP ${fakeTokenResponse.status})`,
    },
    {
      attackId: 'anonymous_announcement_write',
      expected: '토큰 없이 role을 붙인 PUT /api/announcements/:id 요청은 JSON 401 또는 403이어야 함',
      observed: announcementWriteDenied
        ? `${localCheck ? '로컬 ' : ''}비로그인 공지 수정 요청이 JSON으로 거부됨 (HTTP ${announcementWriteResponse.status})`
        : `${localCheck ? '로컬 ' : ''}비로그인 공지 수정 요청이 JSON 401/403으로 거부되지 않음 (HTTP ${announcementWriteResponse.status})`,
    },
    {
      attackId: 'anonymous_note_restore',
      expected: '토큰 없는 POST /api/restore/notes/:id 요청은 JSON 401 또는 403이어야 함',
      observed: restoreDenied
        ? `${localCheck ? '로컬 ' : ''}비로그인 복원 요청이 JSON으로 거부됨 (HTTP ${restoreResponse.status})`
        : `${localCheck ? '로컬 ' : ''}비로그인 복원 요청이 JSON 401/403으로 거부되지 않음 (HTTP ${restoreResponse.status})`,
    },
    {
      attackId: 'anonymous_device_approve',
      expected: '토큰 없는 POST /api/device/approve 요청은 JSON 401 또는 403이어야 함',
      observed: deviceApproveDenied
        ? `${localCheck ? '로컬 ' : ''}비로그인 기기 승인 요청이 JSON으로 거부됨 (HTTP ${deviceApproveResponse.status})`
        : `${localCheck ? '로컬 ' : ''}비로그인 기기 승인 요청이 JSON 401/403으로 거부되지 않음 (HTTP ${deviceApproveResponse.status})`,
    },
    {
      attackId: 'anonymous_ops_summary',
      expected: '토큰 없는 GET /api/ops/summary 요청은 JSON 401 또는 403이어야 함',
      observed: opsDenied
        ? `${localCheck ? '로컬 ' : ''}비로그인 작전실 요약 요청이 JSON으로 거부됨 (HTTP ${opsResponse.status})`
        : `${localCheck ? '로컬 ' : ''}비로그인 작전실 요약 요청이 JSON 401/403으로 거부되지 않음 (HTTP ${opsResponse.status})`,
    },
  ];
}
