// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.

// ---------- 13단계: 로그인 사용자·기기·세션 표시 (renderIdentity) ----------
// 표시 문구는 공식 과제 안내의 대응표를 그대로 따른다. API 상태값은 괄호 안에 원문으로 함께 보인다.
const DEVICE_LABELS = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
const SESSION_LABELS = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
const MODE_NOTES = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };
// 정상처럼 보이면 안 되는 상태(경고 표시). unknown 은 별도의 '확인 불가' 표시를 쓴다.
const WARN_DEVICE = new Set(['noncompliant']);
const WARN_SESSION = new Set(['expired', 'revoked']);

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = String(text);
  return n;
}

// 알 수 없는 값이 와도 정상으로 보이지 않게 '확인 불가'로 떨어뜨린다.
function deviceLabel(status) {
  return `${DEVICE_LABELS[status] ?? DEVICE_LABELS.unknown} (${String(status ?? 'unknown')})`;
}
function sessionLabel(status) {
  return `${SESSION_LABELS[status] ?? SESSION_LABELS.unknown} (${String(status ?? 'unknown')})`;
}
function toneOf(kind, status) {
  const known = kind === 'device' ? DEVICE_LABELS : SESSION_LABELS;
  const warn = kind === 'device' ? WARN_DEVICE : WARN_SESSION;
  if (!Object.hasOwn(known, status) || status === 'unknown') return 'unknown';
  return warn.has(status) ? 'warn' : 'ok';
}
// 상태 문구 + 색상용 클래스. 색상만으로 구분하지 않도록 문구 자체에 상태가 들어간다.
function statusTag(kind, status) {
  const tone = toneOf(kind, status);
  const cls = tone === 'ok' ? 'state state-ok' : tone === 'warn' ? 'state state-error' : 'state state-empty';
  const text = kind === 'device' ? deviceLabel(status) : sessionLabel(status);
  const tag = node('span', cls, tone === 'warn' ? `주의: ${text}` : text);
  return tag;
}

// loading·error·ok 어느 상태에서도 전달받은 모드 안내를 함께 붙인다.
function modeNote(resource) {
  const note = MODE_NOTES[resource?.mode];
  if (!note) return null;
  const p = node('p', resource.mode === 'demo' ? 'tag tag-demo' : 'state state-empty', `모드: ${note} (${resource.mode})`);
  return p;
}

// loading / error / 그 밖의 비정상 입력은 공통으로 처리한다. ok 일 때만 null 을 돌려 본문을 그리게 한다.
function stateLine(resource) {
  if (!resource || typeof resource !== 'object') return node('p', 'state state-empty', '확인 불가: 자료를 받지 못했습니다.');
  if (resource.status === 'loading') {
    const p = node('p', 'state state-loading', '불러오는 중…');
    p.setAttribute('role', 'status');
    return p;
  }
  if (resource.status === 'error') {
    const prefix = resource.error?.code === 'UNVERIFIED' ? '확인 불가' : '연결 실패';
    const message = resource.error?.message || '서버 메시지 없음';
    return node('p', 'state state-error', `${prefix}: ${message}`);
  }
  if (resource.status !== 'ok') return node('p', 'state state-empty', `확인 불가: 알 수 없는 상태(${String(resource.status)})`);
  return null;
}

function section(title, resource, renderOk) {
  const box = node('section', 'student-identity-part');
  box.append(node('h3', null, title));
  const mode = modeNote(resource);
  if (mode) box.append(mode);
  const line = stateLine(resource);
  // ok 가 아니면 상태 문구만 남긴다. 이전 사용자·기기·세션 값은 새 요소에 넣지 않으므로 화면에서 사라진다.
  box.append(line ?? renderOk(resource.data));
  return box;
}

function renderMe(data) {
  const user = data?.user;
  const device = data?.device;
  const session = data?.session;
  if (!user || !device || !session) return node('p', 'state state-empty', '확인 불가: 로그인 정보 형식이 올바르지 않습니다.');
  const dl = node('dl', 'student-identity-list');
  const row = (label, ...values) => {
    const dd = node('dd');
    dd.append(...values);
    dl.append(node('dt', null, label), dd);
  };
  row('사용자', `${user.label || '이름 없음'} (ID: ${user.id ?? '없음'})`);
  row('현재 기기', `${device.label || '이름 없음'} (ID: ${device.id ?? '없음'}) · `, statusTag('device', device.status));
  row('현재 세션', `ID: ${session.id ?? '없음'} · `, statusTag('session', session.status));
  return dl;
}

function renderList(items, emptyText, describe) {
  if (!Array.isArray(items)) return node('p', 'state state-empty', '확인 불가: 목록 형식이 올바르지 않습니다.');
  if (items.length === 0) return node('p', 'state state-empty', emptyText);
  const ul = node('ul', 'plain-list');
  for (const item of items) {
    const li = node('li');
    li.append(...describe(item ?? {}));
    ul.append(li);
  }
  return ul;
}

export function renderIdentity({ me, devices, sessions } = {}) {
  // 호출마다 새 루트를 만든다. app.js 가 학생 칸을 이 요소로 통째로 교체하므로 다시 불러오면 이전 DOM 이 남지 않는다.
  const root = node('div', 'student-identity');
  root.append(
    section('현재 로그인', me, renderMe),
    section('내 기기', devices, (data) => renderList(data, '등록된 기기가 없습니다.', (d) => [
      `${d.label || '이름 없음'} (ID: ${d.id ?? '없음'}) · `, statusTag('device', d.status),
    ])),
    section('내 세션', sessions, (data) => renderList(data, '세션이 없습니다.', (s) => [
      `ID: ${s.id ?? '없음'} · `, statusTag('session', s.status),
    ])),
  );
  return root;
}

// ---------- 14단계: 업무 앱 접근 요청 결과 표시 (renderDecision) ----------
// 판정 문구는 한국어 뜻과 원래 코드값을 함께 보인다. 목록에 없는 값은 확인 불가로 떨어뜨려 허용으로 보이지 않게 한다.
const DECISION_INFO = {
  allow: { label: '접근 허용', cls: 'decision decision-allow', note: '정책상 이 앱 접근이 허용되었습니다. 실제 앱 접속 성공을 보장하지는 않습니다.' },
  deny: { label: '접근 거부', cls: 'decision decision-deny', note: '정책상 이 앱 접근이 거부되었습니다.' },
  challenge: { label: '추가 인증 또는 확인 필요', cls: 'decision decision-challenge', note: '접근하려면 추가 인증 또는 확인이 필요합니다. 이 앱이 확인 절차를 대신 수행하지 않습니다.' },
  unknown: { label: '판정 확인 불가', cls: 'decision decision-unknown', note: '판정을 확인할 수 없습니다. 접근이 허용되지 않은 것으로 다룹니다.' },
};

function formatCheckedAt(value) {
  if (typeof value !== 'string' || !value) return '시각 정보 없음';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? `확인 불가 (${value})` : `${date.toLocaleString('ko-KR')} (${value})`;
}

export function renderDecision({ status, mode, data, error, appId } = {}) {
  const root = node('div', 'student-decision');
  const mNote = modeNote({ mode });
  if (mNote) root.append(mNote);
  const target = data?.appId ?? appId;
  const appLine = target != null ? node('p', null, `대상 앱: ${String(target)}`) : null;

  if (status === 'idle') {
    root.append(node('p', 'state state-empty', '업무 앱을 골라 접근을 요청하세요.'));
    return root;
  }
  if (status === 'loading') {
    const p = node('p', 'state state-loading', '판정 확인 중…');
    p.setAttribute('role', 'status');
    root.append(p);
    if (appLine) root.append(appLine);
    return root;
  }
  if (status === 'error') {
    // 요청 실패는 거부 판정과 다른 상태다. 허용·거부처럼 보이지 않도록 별도 문구를 붙인다.
    root.append(
      node('p', 'decision decision-failed', `요청 실패: ${error?.message || '서버 메시지 없음'}`),
      node('p', 'muted', '이 결과는 접근 거부 판정이 아닙니다. 판정을 받지 못했으므로 접근 허용으로도 보지 않습니다.'),
    );
    if (appLine) root.append(appLine);
    return root;
  }
  if (status !== 'ok' || !data || typeof data !== 'object') {
    root.append(node('p', 'decision decision-unknown', `판정 확인 불가 (unknown): 알 수 없는 응답 상태(${String(status)})`));
    if (appLine) root.append(appLine);
    return root;
  }

  const known = Object.hasOwn(DECISION_INFO, data.decision);
  const info = known ? DECISION_INFO[data.decision] : DECISION_INFO.unknown;
  const code = known ? data.decision : 'unknown';
  root.append(node('p', info.cls, `${info.label} (${code})`));
  if (!known) root.append(node('p', 'muted', `받은 판정 값: ${String(data.decision)} — 목록에 없는 값이라 확인 불가로 처리했습니다.`));
  root.append(node('p', null, info.note));
  const dl = node('dl', 'kv');
  dl.append(
    node('dt', null, '대상 앱'), node('dd', null, target != null ? String(target) : '정보 없음'),
    node('dt', null, '판정 이유'), node('dd', null, data.reason || '판정 이유 정보 없음'),
    node('dt', null, '판정 시각'), node('dd', null, formatCheckedAt(data.checkedAt)),
  );
  root.append(dl);
  return root;
}

export function createStudentView() {
  return {
    renderIdentity,
    renderDecision,
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
