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
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let noPublicNotes = [401, 403, 404].includes(response.status);
  if (response.ok) {
    try {
      const data = await response.json();
      noPublicNotes = Array.isArray(data?.notes) && data.notes.length === 0;
    } catch {
      noPublicNotes = false;
    }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 요청에서 공개 메모가 없어야 함',
    observed: noPublicNotes
      ? `비로그인 요청에서 공개 메모가 없음 (HTTP ${response.status})`
      : `비로그인 요청에서 공개 메모가 있거나 응답 확인 실패 (HTTP ${response.status})` }];
}
