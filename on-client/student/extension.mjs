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

// ---------- 15단계: 접속 기록·XDR 경보 목록과 상세 보기 (renderEvents) ----------
// 받은 배열 안에서만 정렬·필터링한다. 원본 배열과 서버 데이터는 수정하지 않고, 서버에 다시 묻지 않는다.
const KIND_TEXT = { access: '접속 기록', xdr: 'XDR 경보' };
const ACCESS_LABELS = { allowed: '허용됨', denied: '거부됨', unknown: '확인 불가' };
const NO_APP = '';  // appId 가 없는 기록을 거르는 필터 값

function labelWithCode(map, value) {
  return `${map[value] ?? '확인 불가'} (${String(value ?? 'unknown')})`;
}
function eventTime(at) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? `시각 확인 불가 (${String(at)})` : `${d.toLocaleString('ko-KR')} (${at})`;
}
function appText(appId) {
  return appId == null || appId === '' ? '앱 확인 불가 (appId 없음)' : String(appId);
}
const timeOf = (e) => { const t = Date.parse(e?.at); return Number.isNaN(t) ? -Infinity : t; };

function filterSelect(id, label, current, options) {
  const wrap = node('div', 'student-filter');
  const lab = node('label', null, label);
  lab.htmlFor = id;
  const select = node('select');
  select.id = id;
  for (const [value, text] of options) {
    const opt = node('option', null, text);
    opt.value = value;
    if (value === current) opt.selected = true;
    select.append(opt);
  }
  wrap.append(lab, select);
  return { wrap, select };
}

function textRows(title, rows) {
  const box = node('div', 'event-block');
  box.append(node('h4', null, title));
  if (!Array.isArray(rows) || rows.length === 0) {
    box.append(node('p', 'muted', '없음'));
    return box;
  }
  const ul = node('ul');
  for (const r of rows) ul.append(node('li', null, `${r?.id ?? 'ID 없음'}: ${r?.text ?? ''}`));
  box.append(ul);
  return box;
}

function eventDetail(event) {
  const box = node('section', 'student-event-detail');
  box.setAttribute('data-student-event-detail', String(event.id));
  box.append(node('h4', null, `${event.id} 상세`));
  const dl = node('dl', 'kv');
  const s = event.state ?? {};
  dl.append(
    node('dt', null, '사건 ID'), node('dd', null, String(event.id)),
    node('dt', null, '업무 앱'), node('dd', null, appText(event.appId)),
    node('dt', null, '접속 상태 (access)'), node('dd', null, labelWithCode(ACCESS_LABELS, s.access)),
    node('dt', null, '세션 상태 (session)'), node('dd', null, labelWithCode(SESSION_LABELS, s.session)),
    node('dt', null, '기기 상태 (device)'), node('dd', null, labelWithCode(DEVICE_LABELS, s.device)),
  );
  box.append(dl, textRows('근거 (evidence)', event.evidence), textRows('규칙 (rules)', event.rules));
  // 16단계: 연결되지 않은 조치가 넘어온 경우에만 요청을 보내지 않는 비활성 안내 버튼을 둔다. 비어 있으면 아무것도 만들지 않는다.
  const actions = Array.isArray(event.supportedActions) ? event.supportedActions : [];
  if (actions.length > 0) {
    const area = node('div', 'student-unsupported-actions');
    area.append(node('p', 'state state-empty', '아직 지원하지 않는 조치입니다. 조치 실행 연결은 준비 중이며, 아래 버튼은 어떤 요청도 보내지 않습니다.'));
    for (const action of actions) {
      const btn = node('button', 'btn', `${String(action)} 미지원`);
      btn.type = 'button';
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      area.append(btn);
    }
    box.append(area);
  }
  return box;
}

export function renderEvents({ status, mode, data, error } = {}, filters = { kind: 'all', appId: 'all', access: 'all' }) {
  // 호출마다 새 루트를 만든다. 다시 불러오면 이전 목록과 상세 선택이 함께 사라진다.
  const root = node('div', 'student-events');
  const mNote = modeNote({ mode });
  if (mNote) root.append(mNote);

  if (status === 'loading') {
    const p = node('p', 'state state-loading', '기록을 불러오는 중…');
    p.setAttribute('role', 'status');
    root.append(p);
    return root;
  }
  if (status === 'error') {
    const unverified = ['CONTRACT_MISMATCH', 'ENGINE_RESULT_UNVERIFIED'].includes(error?.code);
    const msg = error?.message || '서버 메시지 없음';
    root.append(node('p', 'state state-error', unverified
      ? `확인 불가: 기록을 불러오지 못했습니다(응답 형식 불일치): ${msg}`
      : `기록을 불러오지 못했습니다: ${msg}`));
    return root;
  }
  if (status !== 'ok' || !Array.isArray(data)) {
    root.append(node('p', 'state state-error', `확인 불가: 기록 목록을 확인할 수 없습니다(상태 ${String(status)}).`));
    return root;
  }
  if (data.length === 0) {
    root.append(node('p', 'state state-empty', '표시할 기록이 없습니다.'));
    return root;
  }

  // 원본은 그대로 두고 복사본을 at 기준 최신순으로 정렬한다.
  const sorted = data.map((e, i) => [e, i]).sort((a, b) => timeOf(b[0]) - timeOf(a[0]) || a[1] - b[1]).map(([e]) => e);
  const uniq = (fn) => [...new Set(sorted.map(fn))];
  const kinds = uniq((e) => e.kind);
  const apps = uniq((e) => (e.appId == null ? NO_APP : e.appId));
  const accesses = uniq((e) => e.state?.access);
  // 새 자료에 없는 필터 값은 전체로 되돌린다.
  if (filters.kind !== 'all' && !kinds.includes(filters.kind)) filters.kind = 'all';
  if (filters.appId !== 'all' && !apps.includes(filters.appId)) filters.appId = 'all';
  if (filters.access !== 'all' && !accesses.includes(filters.access)) filters.access = 'all';

  const fKind = filterSelect('student-events-kind', '기록 종류', filters.kind,
    [['all', '전체'], ...kinds.map((k) => [String(k), `${KIND_TEXT[k] ?? '확인 불가'} (${k})`])]);
  const fApp = filterSelect('student-events-app', '업무 앱', filters.appId,
    [['all', '전체'], ...apps.map((a) => [a, appText(a)])]);
  const fAccess = filterSelect('student-events-access', '접속 상태', filters.access,
    [['all', '전체'], ...accesses.map((a) => [String(a), labelWithCode(ACCESS_LABELS, a)])]);
  const bar = node('div', 'student-filters');
  bar.append(fKind.wrap, fApp.wrap, fAccess.wrap);

  const count = node('p', 'muted');
  count.setAttribute('role', 'status');
  const list = node('ul', 'plain-list student-event-list');
  const detailArea = node('div', 'student-event-detail-area');
  detailArea.setAttribute('aria-live', 'polite');
  let selectedId = null;  // 상세 선택은 이 호출 안에서만 유지한다.

  const draw = (focusId = null) => {
    const shown = sorted.filter((e) => (filters.kind === 'all' || e.kind === filters.kind)
      && (filters.appId === 'all' || (e.appId == null ? NO_APP : e.appId) === filters.appId)
      && (filters.access === 'all' || e.state?.access === filters.access));
    count.textContent = `표시 ${shown.length}건 / 받은 기록 ${sorted.length}건`;
    list.replaceChildren();
    if (shown.length === 0) list.append(node('li', 'state state-empty', '선택한 필터에 맞는 기록이 없습니다.'));
    for (const e of shown) {
      const li = node('li', 'student-event');
      li.setAttribute('data-student-event-id', String(e.id));
      li.append(
        node('p', null, `[${KIND_TEXT[e.kind] ?? '확인 불가'} (${e.kind})] ${e.summary ?? '요약 없음'}`),
        node('p', 'muted', `사건 ID: ${e.id} · 시각: ${eventTime(e.at)} · 앱: ${appText(e.appId)}`),
      );
      const btn = node('button', 'btn', `${e.id} 상세`);
      btn.type = 'button';
      btn.setAttribute('aria-expanded', String(selectedId === e.id));
      btn.addEventListener('click', () => {
        selectedId = selectedId === e.id ? null : e.id;
        draw(e.id);  // 다시 그린 뒤에도 키보드 포커스를 같은 버튼에 둔다.
      });
      li.append(btn);
      list.append(li);
      if (focusId === e.id) queueMicrotask(() => btn.focus());
    }
    // 필터로 숨겨진 기록의 상세는 남기지 않는다.
    const sel = shown.find((e) => e.id === selectedId);
    if (!sel) selectedId = null;
    detailArea.replaceChildren(...(sel ? [eventDetail(sel)] : []));
  };

  fKind.select.addEventListener('change', () => { filters.kind = fKind.select.value; draw(); });
  fApp.select.addEventListener('change', () => { filters.appId = fApp.select.value; draw(); });
  fAccess.select.addEventListener('change', () => { filters.access = fAccess.select.value; draw(); });

  draw();
  root.append(bar, count, list, detailArea);
  return root;
}

// ---------- 16단계: 알림·빈 상태·오류·진단 정보 (renderStatus) ----------
// 자동으로 다시 요청하지 않는다. 다시 시도는 사용자가 위쪽 '다시 불러오기' 버튼을 직접 누르는 것으로만 안내한다.
const RETRY_HINT = '다시 시도는 위쪽 다시 불러오기 버튼을 직접 누르세요. 자동으로 다시 요청하지 않습니다.';
const TIMEOUT_CODES = new Set(['TIMEOUT', 'ENGINE_TIMEOUT', 'REQUEST_TIMEOUT', 'WB_CLCO_TIMEOUT']);
const RESOURCE_TEXT = { me: '로그인 정보', apps: '업무 앱 목록', events: '보안 기록', devices: '기기', sessions: '세션', access: '접속 판정', diagnostics: '도움정보' };
// 받침에 맞춰 목적격 조사(을/를)를 붙인다. 예: 기기를, 세션을, 도움정보를
const withObj = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return w + (c >= 0 && c < 11172 && c % 28 ? '을' : '를'); };
const safeCode = (code) => (typeof code === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(code) ? code : '코드 확인 불가');

function failureLines(what, error, hint = RETRY_HINT) {
  const code = error?.code;
  const timeout = TIMEOUT_CODES.has(code);
  return [
    node('p', 'state state-error', `${withObj(what)} 불러오지 못했습니다${timeout ? '(시간 초과)' : ''}: ${error?.message || '서버 메시지 없음'} [${safeCode(code)}]`),
    node('p', 'muted', hint),
  ];
}

function statusPart(title, resource, emptyText, describe, extra) {
  const box = node('section', 'student-status-part');
  box.append(node('h3', null, title));
  if (extra) box.append(node('p', 'muted', extra));
  const mode = modeNote(resource);
  if (mode) box.append(mode);
  const st = resource?.status;
  if (st === 'loading') {
    const p = node('p', 'state state-loading', `${withObj(title)} 불러오는 중…`);
    p.setAttribute('role', 'status');
    box.append(p);
  } else if (st === 'error') {
    box.append(...failureLines(title, resource.error));
  } else if (st === 'ok' && Array.isArray(resource.data)) {
    if (resource.data.length === 0) box.append(node('p', 'state state-empty', emptyText));
    else {
      const ul = node('ul', 'plain-list');
      for (const item of resource.data) {
        const li = node('li');
        li.append(...describe(item ?? {}));
        ul.append(li);
      }
      box.append(ul);
    }
  } else if (st === 'idle' || st == null) {
    box.append(node('p', 'state state-empty', `${withObj(title)} 아직 불러오지 않았습니다.`));
  } else {
    box.append(node('p', 'state state-error', `확인 불가: ${title} 상태를 확인할 수 없습니다(${String(st)}).`));
  }
  return box;
}

// 도움정보는 제공 화면이 조회해 넘긴 값만 쓴다. 학생 코드는 /api/diagnostics 를 호출하지 않는다.
// 정해진 여섯 값만 골라 표시·복사한다. AI 설정 등 그 밖의 값은 옮기지 않는다.
function safeDiagnostics(data) {
  const pick = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '확인 불가');
  return {
    requestId: pick(data?.requestId),
    component: pick(data?.component),
    version: pick(data?.version),
    checkedAt: pick(data?.checkedAt),
    'engine.mode': pick(data?.engine?.mode),
    'engine.code': pick(data?.engine?.code),
  };
}

function diagnosticsPart(diagnostics) {
  const box = node('section', 'student-status-part');
  box.append(node('h3', null, '도움정보'));
  box.append(node('p', 'muted', '도움 요청에 쓸 진단 정보입니다. 아래 여섯 값만 담으며 비밀번호·토큰·API 키는 넣지 않습니다.'));
  const st = diagnostics?.status;
  let safe = null;
  if (st === 'loading') {
    const p = node('p', 'state state-loading', '도움정보를 불러오는 중…');
    p.setAttribute('role', 'status');
    box.append(p);
  } else if (st === 'error') {
    box.append(...failureLines('도움정보', diagnostics.error, '다시 시도는 이 화면의 「도움정보 불러오기」 버튼을 직접 누르세요. 자동으로 다시 요청하지 않습니다.'));
  } else if (st === 'ok') {
    safe = safeDiagnostics(diagnostics.data);
    const dl = node('dl', 'kv');
    for (const [k, v] of Object.entries(safe)) dl.append(node('dt', null, k), node('dd', null, v));
    box.append(dl);
  } else {
    box.append(node('p', 'state state-empty', '도움정보를 아직 불러오지 않았습니다. 필요하면 이 화면의 「도움정보 불러오기」 버튼을 직접 누르세요.'));
  }
  const result = node('p', 'muted');
  result.setAttribute('role', 'status');
  const copy = node('button', 'btn', '도움정보 복사');
  copy.type = 'button';
  copy.disabled = !safe;
  copy.addEventListener('click', async () => {
    if (!safe) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(safe, null, 2));
      result.textContent = '도움정보(위 여섯 값)를 클립보드에 복사했습니다. 어디에도 자동으로 전송되지 않습니다.';
    } catch {
      result.textContent = '클립보드에 복사하지 못했습니다. 위 값을 직접 선택해 복사하세요.';
    }
  });
  box.append(copy, result);
  return box;
}

export function renderStatus({ devices, sessions, notifications, diagnostics, mode } = {}) {
  // 호출마다 새로 그린다. 다시 불러와 성공하면 이전 실패 안내는 새 요소에 들어가지 않으므로 사라진다.
  const root = node('div', 'student-status');
  const m = modeNote({ mode });
  if (m) root.append(m);

  // 알림
  const nBox = node('section', 'student-status-part');
  nBox.append(node('h3', null, '알림'));
  const list = Array.isArray(notifications) ? notifications : [];
  if (list.length === 0) nBox.append(node('p', 'state state-ok', '주의할 알림이 없습니다.'));
  else {
    nBox.append(node('p', 'muted', `주의할 알림 ${list.length}건`));
    const ul = node('ul', 'plain-list');
    for (const n of list) {
      const res = String(n?.resource ?? '확인 불가');
      ul.append(node('li', 'state state-error', `[${RESOURCE_TEXT[res] ?? '자료'} (${res})] ${safeCode(n?.code)}: ${n?.message ?? '메시지 없음'}`));
    }
    nBox.append(ul);
  }

  root.append(
    nBox,
    statusPart('기기', devices, '등록된 기기가 없습니다.', (d) => [`${d.label || '이름 없음'} · `, statusTag('device', d.status)]),
    statusPart('세션', sessions, '현재 연결 없음: 검증된 세션이 없습니다.', (s) => [`ID: ${s.id ?? '없음'} · `, statusTag('session', s.status)],
      '세션은 지금 검증된 연결 하나만 표시합니다. 지난 세션 목록이 아닙니다.'),
    diagnosticsPart(diagnostics),
  );
  return root;
}

// ---------- 17단계: 앱 내부 AI 연결 상태 (renderAiConnection) ----------
// 연결 점검(모델 목록 응답)과 실제 사건 설명 실행은 다른 결과다. 점검 성공을 사건 설명 성공으로 쓰지 않는다.
// 오류는 app.js 가 넘긴 안전한 code·message 만 쓴다. 열쇠나 원문 오류는 다루지 않는다. 자동으로 다시 점검하지 않는다.
const AI_RECHECK_HINT = '다시 점검은 AI 연결 칸의 점검 버튼을 직접 누르세요. 자동으로 다시 점검하지 않습니다.';
const AI_ERROR_GROUPS = [
  { title: '권한 준비 중·확인 불가', codes: ['ON_AI_PROVISIONING_PENDING', 'ON_AI_AUTHORIZATION_CHANGED', 'AI_REQUEST_UNVERIFIED', 'SUBJECT_SCOPE_UNVERIFIED'],
    guide: '운영 측 권한 준비가 필요할 수 있습니다. 담당자에게 계정 연결과 앱 권한 확인을 요청하세요. 학생 코드 오류로 단정하지 않습니다.' },
  { title: '인증 실패', codes: ['WB_CLCO_AUTH_REQUIRED'],
    guide: '계정 연결을 다시 확인하고, 계속되면 담당자에게 확인하세요. Workbench 열쇠나 원본 열쇠를 복사하지 마세요.' },
  { title: '접근 제한', codes: ['WB_CLCO_ACCESS_BLOCKED'],
    guide: '계정 연결을 다시 확인하고, 이용 권한과 운영 중지 여부를 담당자에게 확인하세요.' },
  { title: '사용량·이용 한도', codes: ['WB_CLCO_COHORT_BUDGET_EXHAUSTED', 'WB_CLCO_LIMIT_REACHED'],
    guide: '반 사용량 또는 이용 한도에 도달했습니다. 담당자에게 확인하세요.' },
  { title: '이용 시간 아님', codes: ['WB_CLCO_SESSION_CLOSED'],
    guide: '현재 AI 이용 시간이 아닙니다. 이용 시간을 확인하세요.' },
  { title: '요청 제한·시간 초과·네트워크', codes: ['WB_CLCO_RATE_LIMITED', 'WB_CLCO_TIMEOUT', 'REQUEST_TIMEOUT', 'ENGINE_TIMEOUT', 'TIMEOUT', 'NETWORK_ERROR', 'SERVICE_UNAVAILABLE'],
    guide: '잠시 뒤 직접 다시 점검하세요.' },
  { title: '취소됨', codes: ['WB_CLCO_CANCELLED', 'CANCELLED', 'REQUEST_CANCELLED'],
    guide: '요청을 취소했습니다. 이전 결과는 현재 결과가 아닙니다.' },
  { title: '사용할 수 있는 모델 없음', codes: ['ON_AI_MODEL_LIST_EMPTY', 'MODEL_NOT_CONFIGURED'],
    guide: '담당자에게 모델 허용 설정 확인을 요청하세요.' },
  { title: '응답 형식 확인 불가', codes: ['ON_AI_INVALID_INPUT', 'ON_AI_INVALID_OUTPUT', 'CONTRACT_MISMATCH'],
    guide: '응답을 확인할 수 없어 결과로 쓰지 않습니다. 기존 기록을 확인하세요.' },
];
function aiErrorGroup(code) {
  return AI_ERROR_GROUPS.find((g) => g.codes.includes(code))
    ?? { title: '확인 불가', guide: 'AI 연결 상태를 확인할 수 없습니다. 담당자에게 계정 연결과 앱 권한 확인을 요청하세요.' };
}
const AUDIENCE_TEXT = { test: '시험 연결 점검(test)', verified: '앱 권한 확인 후 점검(verified)' };

function aiErrorLines(error) {
  const code = safeCode(error?.code);
  const group = aiErrorGroup(error?.code);
  return [
    node('p', 'state state-error', `${group.title} [${code}]: ${error?.message || '서버 메시지 없음'}`),
    node('p', 'muted', group.guide),
  ];
}

export function renderAiConnection({ status, mode, data, error, checkedAt, explanationAccepted } = {}) {
  // 호출마다 새로 그린다. 다시 점검해 성공하거나 idle 로 돌아오면 이전 결과·오류 안내는 남지 않는다.
  const root = node('div', 'student-ai-connection');
  const m = modeNote({ mode });
  if (m) root.append(m);
  if (status === 'idle' || status == null) {
    root.append(node('p', 'state state-empty', 'AI 연결 점검 전'), node('p', 'muted', '점검은 AI 연결 칸의 점검 버튼을 직접 눌러야 시작됩니다.'));
    return root;
  }
  if (status === 'loading') {
    const p = node('p', 'state state-loading', 'AI 연결 점검 중…');
    p.setAttribute('role', 'status');
    root.append(p, node('p', 'muted', '점검 중 취소하면 늦게 도착한 응답은 현재 결과로 쓰지 않습니다.'));
    return root;
  }
  if (status === 'error') {
    root.append(...aiErrorLines(error), node('p', 'muted', AI_RECHECK_HINT));
    return root;
  }
  if (status !== 'ok' || !data || data.transportChecked !== true || !Object.hasOwn(AUDIENCE_TEXT, data.audienceAuthorization)) {
    root.append(node('p', 'state state-error', '확인 불가: AI 연결 점검 결과를 확인할 수 없습니다.'), node('p', 'muted', AI_RECHECK_HINT));
    return root;
  }
  root.append(node('p', 'state state-ok', `AI 연결 점검 완료 · ${AUDIENCE_TEXT[data.audienceAuthorization]}`));
  const dl = node('dl', 'kv');
  dl.append(
    node('dt', null, '점검 방식'), node('dd', null, AUDIENCE_TEXT[data.audienceAuthorization]),
    node('dt', null, '응답한 모델 수'), node('dd', null, Number.isInteger(data.modelCount) ? `${data.modelCount}개` : '확인 불가'),
    node('dt', null, '점검 시각'), node('dd', null, formatCheckedAt(checkedAt)),
  );
  root.append(dl);
  if (data.audienceAuthorization === 'test') root.append(node('p', 'muted', '시험 연결 점검입니다. 앱 권한 확인(verified)이 끝난 결과가 아닙니다.'));
  // 연결 점검만으로 사건 설명이 된 것이 아니다.
  root.append(node('p', 'state state-empty', explanationAccepted === true
    ? '사건 설명 결과는 보안 기록의 AI 사건 설명 칸에서 따로 확인하세요.'
    : '연결만 점검했습니다. 사건 설명은 아직 실행하지 않았습니다. 사건 설명은 보안 기록에서 따로 요청하고 확인합니다.'));
  root.append(node('p', 'muted', AI_RECHECK_HINT));
  return root;
}

// ---------- 18단계: 근거에 연결된 AI 보안 이벤트 설명 (renderExplanation) ----------
// AI 설명은 해석(참고용)이다. 사실 판단은 선택한 기록의 근거 글·규칙 글·연동 시스템이 알려 준 상태로 한다.
// 근거 ID 는 현재 선택한 기록(event.evidence)의 id 와 대조만 하고, 없는 근거를 만들어 맞추지 않는다.
// 성공 표식(data-student-explanation-event)은 검증을 모두 통과한 설명에만 붙인다. 실행 버튼은 만들지 않는다.
// 호출마다 새 루트를 만들므로 다른 기록 선택·다시 불러오기·실패 시 이전 설명과 성공 표식은 남지 않는다.
const EXPLAIN_STATE_KEYS = [['access', '접속'], ['session', '세션'], ['device', '기기']];
const SELECT_FIRST_TEXT = '보안 기록에서 기록을 먼저 고르세요. AI 설명은 선택한 기록에 대해서만 요청합니다.';

function explanationShell(event) {
  const root = node('div', 'student-explanation');
  if (event?.id != null) root.append(node('p', 'muted', `선택한 기록: ${String(event.id)}`));
  return root;
}

function explanationRejected(event, reason, code) {
  const root = explanationShell(event);
  const p = node('p', 'state state-error', `AI 설명을 쓸 수 없습니다${code ? ` [${safeCode(code)}]` : ''}: ${reason}`);
  p.setAttribute('role', 'alert');
  root.append(p, node('p', 'muted', '설명 내용은 표시하지 않습니다. 기록은 그대로입니다.'));
  return root;
}

function listBlock(title, lines, emptyText) {
  const box = node('div', 'event-block');
  box.append(node('h4', null, title));
  if (lines.length === 0) {
    box.append(node('p', 'muted', emptyText));
    return box;
  }
  const ul = node('ul');
  for (const line of lines) ul.append(node('li', null, line));
  box.append(ul);
  return box;
}

// 근거 ID 목록이 비어 있지 않고, 중복 없이, 모두 현재 기록의 근거에 있는지 본다.
function evidenceCheck(ids, evidenceById) {
  if (!Array.isArray(ids) || ids.length === 0) return 'empty';
  if (new Set(ids).size !== ids.length) return 'mismatch';
  return ids.every((id) => typeof id === 'string' && evidenceById.has(id)) ? 'ok' : 'mismatch';
}

export function renderExplanation({ event, explanation, checkedAt } = {}) {
  const st = explanation?.status;

  // 1) 실패: event 가 null 이어도 안전한 오류 코드·메시지와 실패 이유를 먼저 보인다. 성공 표식은 붙이지 않는다.
  if (st === 'error') {
    const root = explanationShell(event);
    const code = safeCode(explanation.error?.code);
    const p = node('p', 'state state-error', `AI 설명 실패: [${code}] ${explanation.error?.message || '서버 메시지 없음'}`);
    p.setAttribute('role', 'alert');
    root.append(
      p,
      node('p', 'muted', aiErrorGroup(explanation.error?.code).guide),
      node('p', 'muted', '기록은 그대로입니다. AI 설명 실패는 과제 실패가 아니며, 업무 앱 판정과 보안 기록은 계속 동작합니다.'),
    );
    return root;
  }

  // 2) 오류 없이 기록만 없는 경우: 기록을 먼저 고르도록 안내한다.
  if (!event || event.id == null) {
    const root = node('div', 'student-explanation');
    root.append(node('p', 'state state-empty', SELECT_FIRST_TEXT));
    return root;
  }

  // 3) 요청 중
  if (st === 'loading') {
    const root = explanationShell(event);
    const p = node('p', 'state state-loading', `AI 설명 요청 중: ${String(event.id)} (결과 아님)`);
    p.setAttribute('role', 'status');
    root.append(p);
    return root;
  }

  // 4) 아직 요청 전
  if (st !== 'ok') {
    const root = explanationShell(event);
    root.append(node('p', 'state state-empty', 'AI 설명 요청 전입니다. 보안 기록의 AI 설명 요청 버튼을 직접 누르세요.'));
    return root;
  }

  // 5) 성공 응답 검증: 근거가 맞지 않거나 이미 실행했다는 설명은 쓰지 않는다(내용을 지어내지 않음).
  const data = explanation.data;
  if (!data || typeof data !== 'object') {
    return explanationRejected(event, '설명 내용이 없습니다(근거 부족).', explanation.error?.code);
  }
  const claimedEventId = data.eventId ?? explanation.eventId;
  if (claimedEventId != null && String(claimedEventId) !== String(event.id)) {
    return explanationRejected(event, `다른 기록(${String(claimedEventId)})에 대한 설명입니다(선택한 기록과 불일치).`, explanation.error?.code);
  }
  if (data.executed !== false) {
    return explanationRejected(event, 'AI 가 이미 실행했다고 답한 설명은 쓸 수 없습니다. 설명·제안만으로 조치는 실행되지 않습니다.', explanation.error?.code);
  }
  if (data.requiresHumanConfirmation !== true) {
    return explanationRejected(event, '사람 확인이 필요하다는 표시가 없는 설명은 쓸 수 없습니다.', explanation.error?.code);
  }
  if (typeof data.summary !== 'string' || data.summary.trim() === '') {
    return explanationRejected(event, 'AI 요약이 비어 있습니다(근거 부족).', explanation.error?.code);
  }
  const evidence = Array.isArray(event.evidence) ? event.evidence : [];
  const evidenceById = new Map(evidence.filter((e) => e && e.id != null).map((e) => [String(e.id), e]));
  const mainCheck = evidenceCheck(data.evidenceIds, evidenceById);
  if (mainCheck === 'empty') {
    return explanationRejected(event, '설명이 인용한 근거가 없습니다(근거 부족).', explanation.error?.code);
  }
  if (mainCheck !== 'ok') {
    return explanationRejected(event, '설명이 인용한 근거 ID 가 선택한 기록의 근거와 맞지 않습니다(근거 불일치).', explanation.error?.code);
  }
  const proposals = Array.isArray(data.proposals) ? data.proposals : [];
  const supported = Array.isArray(event.supportedActions) ? event.supportedActions : [];
  for (const proposal of proposals) {
    if (evidenceCheck(proposal?.evidenceIds, evidenceById) !== 'ok') {
      return explanationRejected(event, '제안이 인용한 근거 ID 가 선택한 기록의 근거와 맞지 않습니다(근거 불일치).', explanation.error?.code);
    }
    if (!supported.includes(proposal?.action)) {
      return explanationRejected(event, `연동 시스템이 지원하지 않는 조치(${String(proposal?.action)})를 제안했습니다.`, explanation.error?.code);
    }
  }

  // 6) 성공: 검증을 모두 통과한 설명에만 성공 표식을 붙인다.
  const root = node('div', 'student-explanation');
  root.setAttribute('data-student-explanation-event', String(event.id));
  root.append(
    node('p', 'state state-ok', 'AI 설명 응답을 받았습니다(근거 대조 완료).'),
    node('p', null, `사건 ID: ${String(event.id)}`),
    node('h4', null, 'AI 설명(참고용)'),
    node('p', null, data.summary),
    node('p', 'muted', `설명 시각: ${formatCheckedAt(checkedAt)}`),
  );
  root.append(listBlock('인용한 근거 (evidenceIds)',
    data.evidenceIds.map((id) => `${id} — ${String(evidenceById.get(id).text ?? '')}`), '없음'));
  const rules = Array.isArray(event.rules) ? event.rules : [];
  root.append(listBlock('규칙 (rules)',
    rules.map((r) => `${String(r?.id ?? 'ID 없음')} — ${String(r?.text ?? '')}`), '없음'));
  const s = event.state ?? {};
  const unknownLines = EXPLAIN_STATE_KEYS
    .filter(([key]) => s[key] === 'unknown' || s[key] == null)
    .map(([key, label]) => `${label}: 확인 불가(${String(s[key] ?? 'unknown')})`);
  root.append(listBlock('확인 불가 상태', unknownLines, '없음'));
  if (proposals.length === 0) {
    root.append(listBlock('AI 제안', [], supported.length === 0
      ? '연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상).'
      : 'AI 가 제안한 조치가 없습니다.'));
  } else {
    root.append(listBlock('AI 제안',
      proposals.map((p) => `${String(p.action)} — ${String(p.reason ?? '')} (근거: ${p.evidenceIds.join(', ')}) · 사람 확인이 필요하며 실행되지 않았습니다(미실행).`), '없음'));
  }
  root.append(node('p', 'muted', 'AI 설명은 참고 정보입니다. 설명·제안만으로 보안 조치가 실행되지 않습니다.'));
  return root;
}

export function createStudentView() {
  // 필터 선택은 같은 화면에서 다시 불러와도 유지한다. 상세 선택은 새 자료가 오면 초기화된다.
  const eventFilters = { kind: 'all', appId: 'all', access: 'all' };
  return {
    renderIdentity,
    renderDecision,
    renderEvents: (input) => renderEvents(input, eventFilters),
    renderStatus,
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection,
    renderExplanation,
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
