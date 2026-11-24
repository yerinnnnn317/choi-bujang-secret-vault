// 9단계 탐지 함수입니다. 회수를 직접 집행하지 않고 회수 제안만 돌려줍니다.
// 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.
// 사건마다 at(시각)·method(요청 종류)·identity.sub(가명 사용자) 세 값만 읽습니다.
// 네트워크·기기·지역 값을 지어내거나 조건으로 쓰지 않고, 메모 내용·토큰·실명은 저장하거나 출력하지 않습니다.

// 사건 하나에서 세 값만 꺼낸다. 형식이 맞지 않으면 null(그 사건은 세지 않음, 다른 값으로 채우지 않음).
function readEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  const time = typeof event.at === 'string' ? Date.parse(event.at) : Number.NaN;
  const method = typeof event.method === 'string' ? event.method.toUpperCase() : null;
  const sub = event.identity && typeof event.identity === 'object' ? event.identity.sub : undefined;
  if (!Number.isFinite(time) || !method || typeof sub !== 'string' || sub.length === 0) return null;
  return { time, method, sub };
}

// 만들기 2 · 규칙 burst_read: 같은 identity.sub 의 GET 사건이 어느 10분 구간에서든 120건을 넘으면 의심.
// 정확히 120건은 의심이 아니다. 다른 사용자의 사건이나 10분 밖의 사건은 합치지 않는다. 창 계산은 at 시각만 쓴다.
const BURST_WINDOW_MS = 10 * 60 * 1000;
const BURST_LIMIT = 120;

// 의심 사용자를 돌려준다. 여러 명이면 폭주 구간이 가장 먼저 시작된 사용자. 없으면 null.
function findBurstSubject(readable) {
  const timesBySub = new Map();
  for (const { time, method, sub } of readable) {
    if (method !== 'GET') continue;
    if (!timesBySub.has(sub)) timesBySub.set(sub, []);
    timesBySub.get(sub).push(time);
  }
  let found = null;
  for (const [sub, times] of timesBySub) {
    times.sort((x, y) => x - y);
    let end = 0;
    for (let start = 0; start < times.length; start += 1) {
      // [times[start], times[start] + 10분) 구간에 들어오는 사건 수
      while (end < times.length && times[end] - times[start] < BURST_WINDOW_MS) end += 1;
      if (end - start > BURST_LIMIT) {
        if (!found || times[start] < found.windowStart) found = { sub, windowStart: times[start] };
        break;
      }
    }
  }
  return found ? found.sub : null;
}

export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const readable = events.map(readEvent).filter(Boolean);
  const subject = findBurstSubject(readable);
  // 만들기 3 · 의심이면 정확히 세 키만, 아니면 observe 하나만 돌려준다. 기기 번호 같은 다른 키는 붙이지 않는다.
  if (subject !== null) return { action: 'propose_revocation', reasonCode: 'burst_read', subject };
  return { action: 'observe' };
}
