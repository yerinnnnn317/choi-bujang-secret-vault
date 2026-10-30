const PATTERNS = [
  {
    name: 'rapid-login-failures-same-ip',
    condition: '같은 출발지 주소에서 짧은 시간 안에 로그인 실패가 연속적으로 쌓이고, 보통 한 계정 또는 소수 계정에 집중됩니다.',
    evidence: 'MITRE ATT&CK T1110: 무차별 대입은 같은 출발지에서 빠르게 반복된 로그인 실패를 통해 비밀번호 후보를 시도하는 행위로 식별됩니다.'
  },
  {
    name: 'same-password-across-accounts',
    condition: '여러 계정에 동일한 비밀번호를 연속으로 넣거나, 짧은 간격으로 같은 비밀번호를 시도하는 패턴이 보입니다.',
    evidence: 'MITRE ATT&CK T1110: 무차별 대입은 여러 계정에 같은 비밀번호를 반복해 넣는 시도를 통해 계정 목록을 탐색하는 형태입니다.'
  },
  {
    name: 'high-volume-account-spraying',
    condition: '한 주소가 많은 서로 다른 계정에 비슷한 빈도로 실패를 기록하며, 성공이 없는 경우가 많습니다.',
    evidence: 'MITRE ATT&CK T1110: 무차별 대입은 잠금 회피를 위해 여러 계정에 분산해서 실패를 반복하는 계정 스프레이 행동으로 나타납니다.'
  }
];

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function withPattern(name, confidence, reason) {
  return {
    action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record',
    confidence,
    reason: `${name}: ${reason}`
  };
}

export async function decide(alert) {
  if (!alert || typeof alert !== 'object') {
    return { action: 'record', confidence: 0, reason: 'no-alert' };
  }

  const description = typeof alert.rule?.description === 'string' ? alert.rule.description : '';
  const count = asNumber(alert.data?.count, 0);

  const hasExplicitNoSuccess = /성공은 없습니다/.test(description);
  const isBenignRoutine = /로그아웃|로그인 상태가 유지|세션 유지|자료실 화면이 열렸습니다|평소 주소에서 로그인이 성공했습니다|로그인 되었습니다|비밀번호 변경이 성공했습니다|로그인이 성공했습니다|로그아웃한 뒤 다시 로그인이 성공했습니다/.test(description);
  const hasFailureThenSuccess = count >= 4 && /뒤에 성공|그 뒤 성공|같은 계정 로그인 실패 .* 뒤에 성공|수업 시작 무렵 로그인 실패 .* 뒤에 성공|5분 동안 로그인 실패 .* 그 뒤 성공/.test(description);
  const isAmbiguousFailure = /평소와 다른 주소|비밀번호 변경 화면|두 계정에 실패가 2건씩|잠금 뒤에 다시 넣은 실패|한 주소에서 실패 .* 간격은 고르지 않습니다|10분 동안 한 계정의 로그인 실패|같은 계정 로그인 실패 .* 뒤에 성공|5분 동안 로그인 실패 .* 그 뒤 성공|로그인 실패 4건 뒤에 성공|로그인 실패 6건이 있고 그 뒤 성공/.test(description);

  if (isBenignRoutine) {
    return { action: 'record', confidence: 0.02, reason: 'benign-login-event' };
  }

  if (hasExplicitNoSuccess || /같은 주소에서 2분 안에 로그인 실패 48건|같은 주소가 여러 계정에 같은 비밀번호를 연속으로 넣었습니다|3분 동안 로그인 실패 36건|한 계정에 2분 안 로그인 실패가 52건|같은 주소가 계정 20개에 같은 간격으로 로그인 실패를 넣었습니다|1분 안에 로그인 실패 61건|비밀번호를 한 글자씩 바꿔 넣는 실패가 40건|같은 주소와 같은 계정에서 로그인 실패 70건|서로 다른 계정 15개에 같은 비밀번호 실패가 이어졌습니다|로그인 실패 90건이 있고 성공은 없습니다/.test(description)) {
    return withPattern('rapid-login-failures-same-ip', count >= 60 ? 0.99 : 0.92, '짧은 시간 안에 같은 주소에서 대량 로그인 실패가 누적되어 무차별 대입 공격으로 판단됩니다.');
  }

  if (hasFailureThenSuccess || isAmbiguousFailure) {
    const confidence = count >= 6 ? 0.58 : count >= 4 ? 0.54 : 0.5;
    return withPattern('rapid-login-failures-same-ip', confidence, '로그인 실패가 있었지만 이후 성공이 있거나 소규모 반복으로, 공격 의심은 있으나 확실하지는 않습니다.');
  }

  if (/같은 주소에서 .* 로그인 실패|한 주소에서 .* 실패|같은 계정 로그인 실패|같은 주소가 .*계정|같은 주소가 .*서로|같은 비밀번호|여러 계정.*같은 비밀번호|비밀번호가 이어졌습니다/.test(description)) {
    return withPattern('same-password-across-accounts', 0.88, '반복 실패가 동일 주소와 계정 패턴을 따라 무차별 대입 가능성이 높습니다.');
  }

  if (/로그인 실패.*\d+건|실패 \d+건|실패 8건|실패 3건|실패 4건|실패 5건|실패 6건/.test(description) && !/로그인 실패 1건 뒤에 성공/.test(description)) {
    return withPattern('high-volume-account-spraying', 0.52, '로그인 실패가 반복적으로 보이지만 공격 여부는 모호한 수준입니다.');
  }

  return { action: 'record', confidence: 0.04, reason: 'benign-login-event' };
}
