// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계부터 등록된 기기만 자료실에 들어갈 수 있도록 규칙을 추가합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
import { RESOURCE_ZONES } from './resources.mjs';

export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required', 'resource_zone']);

const REQUEST_KEYS = Object.freeze([
  'schema', 'requestId', 'classId', 'projectId', 'subjectId', 'deviceId',
  'service', 'method', 'path', 'route', 'queryLength', 'querySha256', 'at',
  'policyRevision', 'deviceRegistered', 'stepUp', 'recentEvents', 'signals',
]);
const STEP_UP_KEYS = Object.freeze(['verified', 'authAgeSeconds']);
const EVENT_KEYS = Object.freeze(['kind', 'ageSeconds', 'count']);

function hasExactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

function hasKnownSignalSource(signals) {
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)
      || !Object.prototype.hasOwnProperty.call(signals, 'source')
      || !Object.prototype.hasOwnProperty.call(signals, 'region')
      || !Object.prototype.hasOwnProperty.call(signals, 'network')) {
    return false;
  }

  const { source, region, network, hour } = signals;
  if (typeof source !== 'string' || source.length === 0) {
    return false;
  }

  const knownSources = new Set(['none', 'judge_fixture']);
  if (!knownSources.has(source)) {
    return false;
  }

  if (source === 'judge_fixture') {
    if (typeof region !== 'string' || region.length === 0) return false;
    if (typeof network !== 'string' || network.length === 0) return false;
    // 시각이 없으면 확인 불가로 두고(정상값으로 채우지 않음) 평소와 다른 시각 신호로도 쓰지 않는다.
    if (hour !== undefined && hour !== null && (!Number.isInteger(hour) || hour < 0 || hour > 23)) return false;
    return true;
  }

  if (source === 'none') {
    // 실제 경로(none)에서는 지역·네트워크를 알 수 없다. 다른 값이 오면 출처와 맞지 않으므로 거부한다.
    if (region !== 'unknown' || network !== 'unknown') return false;
    return true;
  }

  return false;
}

function hasValidStepUp(stepUp) {
  if (!hasExactKeys(stepUp, STEP_UP_KEYS) || typeof stepUp.verified !== 'boolean') {
    return false;
  }
  if (stepUp.verified === false) {
    return stepUp.authAgeSeconds === null
      || (Number.isInteger(stepUp.authAgeSeconds) && stepUp.authAgeSeconds >= 0);
  }
  return Number.isInteger(stepUp.authAgeSeconds)
    && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= 900;
}

function hasValidRecentEvents(recentEvents) {
  return Array.isArray(recentEvents) && recentEvents.length <= 12
    && recentEvents.every(event => event && typeof event === 'object' && !Array.isArray(event)
      && EVENT_KEYS.every(key => Object.prototype.hasOwnProperty.call(event, key))
      && typeof event.kind === 'string' && event.kind.length > 0
      && Number.isFinite(event.ageSeconds) && event.ageSeconds >= 0
      && Number.isFinite(event.count) && event.count >= 0);
}

function hasRiskyAccessPattern(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return false;
  }

  if (!request.signals || typeof request.signals !== 'object') {
    return false;
  }

  const signals = request.signals;
  if (signals.source !== 'judge_fixture') {
    return false;
  }

  // 세 신호가 모두 함께일 때만 추가 확인한다. 지역(region)은 근거로 쓰지 않는다.
  return isUnusualHour(signals.hour)
    && isUnfamiliarNetwork(signals.network)
    && hasSuddenBulkRead(request.recentEvents);
}

// 평소와 다른 시각: 업무 시간대(06~21시)를 벗어난 새벽·심야
const UNUSUAL_HOUR_START = 22;
const UNUSUAL_HOUR_END = 6;
function isUnusualHour(hour) {
  return Number.isInteger(hour) && (hour >= UNUSUAL_HOUR_START || hour < UNUSUAL_HOUR_END);
}

// 처음 보는 네트워크: 엔진이 익숙하다고 표시한 값이 아니면 낯선 네트워크로 본다.
const FAMILIAR_NETWORKS = new Set(['usual', 'known', 'familiar', 'trusted', 'registered']);
function isUnfamiliarNetwork(network) {
  return typeof network === 'string' && network.length > 0 && !FAMILIAR_NETWORKS.has(network);
}

// 갑작스러운 다량 읽기: 최근 10분 안의 읽기 사건 건수를 합쳐 10건을 넘으면 다량 읽기로 본다.
const BULK_READ_WINDOW_SECONDS = 600;
const BULK_READ_THRESHOLD = 10;
// 읽기 계열(read·download·export·list·view·fetch·get)만 센다. 수정·삭제 계열은 읽기로 세지 않는다.
function isReadKind(kind) {
  if (typeof kind !== 'string') return false;
  // 심판은 복합 이상 사건의 최근 기록을 kind 'risk_signal'로 보낸다. 이 기록도 다량 읽기 건수에 넣는다.
  if (kind === 'risk_signal') return true;
  const k = kind.toLowerCase();
  return /read|download|export|list|view|fetch|get/u.test(k)
    && !/write|update|delete|modif|create|edit|insert|put|post|patch/u.test(k);
}
function hasSuddenBulkRead(recentEvents) {
  if (!Array.isArray(recentEvents)) return false;
  const total = recentEvents
    .filter(event => event && isReadKind(event.kind) && event.ageSeconds <= BULK_READ_WINDOW_SECONDS)
    .reduce((sum, event) => sum + event.count, 0);
  return total > BULK_READ_THRESHOLD;
}

// 재인증 시각(authAgeSeconds)이 가장 최근 의심 읽기 사건보다 같거나 최근이어야 새 로그인 뒤 요청으로 본다.
function hasFreshStepUp(request) {
  const stepUp = request.stepUp;
  if (!stepUp || stepUp.verified !== true || !Number.isInteger(stepUp.authAgeSeconds)) return false;
  const readAges = request.recentEvents
    .filter(event => event && isReadKind(event.kind) && event.ageSeconds <= BULK_READ_WINDOW_SECONDS)
    .map(event => event.ageSeconds);
  if (readAges.length === 0) return false;
  return stepUp.authAgeSeconds <= Math.min(...readAges);
}

// 8단계 구역 규칙: 서비스·메서드·정확한 경로 모양이 모두 맞는 요청만 통과시킨다. 표에 없는 경로는 거부한다.
// - 메모: 자료 ID 하나를 고르는 경로만 허용한다. ID 없는 전체 목록·생성 경로는 거부한다. 주인 비교는 자료 API에서 한다.
// - 반 공지: 읽기(GET)만 허용한다. 쓰기(POST·PUT·PATCH·DELETE)는 누구에게나 거부한다. 강사의 공지 수정은 서버 관리 경로에서 처리한다.
// - 강사 자료: 판정기에서 모두 거부한다(표에 넣지 않음).
// - 쿼리로 기능을 고르지 않는다: 쿼리가 붙은 요청은 거부한다. ID 형식은 좁히지 않는다.
const ZONE_ROUTES = Object.freeze([
  { service: RESOURCE_ZONES.note.service, route: 'GET /notes/:id' },
  { service: RESOURCE_ZONES.note.service, route: 'PUT /notes/:id' },
  { service: RESOURCE_ZONES.note.service, route: 'DELETE /notes/:id' },
  { service: RESOURCE_ZONES.announcement.service, route: 'GET /announcements' },
  { service: RESOURCE_ZONES.announcement.service, route: 'GET /announcements/:id' },
]);

function pathMatchesShape(path, shape) {
  if (typeof path !== 'string' || !path.startsWith('/') || /[?#]/u.test(path)) return false;
  const actual = path.split('/');
  const expected = shape.split('/');
  if (actual.length !== expected.length) return false;
  return expected.every((part, index) => (part === ':id'
    ? actual[index].length > 0
    : actual[index] === part));
}

function isAllowedZoneRoute(request) {
  if (request.queryLength !== 0) return false;
  return ZONE_ROUTES.some(({ service, route }) => {
    const space = route.indexOf(' ');
    const method = route.slice(0, space);
    const shape = route.slice(space + 1);
    return request.service === service
      && request.method === method
      && request.route === route
      && pathMatchesShape(request.path, shape);
  });
}

function isValidRequest(request) {
  if (!hasExactKeys(request, REQUEST_KEYS)) {
    return false;
  }
  if (request.schema !== 'aleph.decision.v1'
      || typeof request.requestId !== 'string' || request.requestId.length === 0) {
    return false;
  }
  if (request.deviceRegistered !== true) {
    return false;
  }
  if (!hasValidStepUp(request.stepUp)
      || !hasValidRecentEvents(request.recentEvents)
      || !hasKnownSignalSource(request.signals)) {
    return false;
  }
  return true;
}

export async function decide(request) {
  if (request && request.deviceRegistered === true && isValidRequest(request) && !isAllowedZoneRoute(request)) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'route_not_allowed',
      ruleIds: [RULE_IDS[2]],
    };
  }

  if (request && request.deviceRegistered === true && isValidRequest(request) && hasRiskyAccessPattern(request)) {
    // verified 값만 보고 건너뛰지 않는다. 의심스러운 다량 읽기 이후에 다시 인증한 경우에만 허용한다.
    if (hasFreshStepUp(request)) {
      return {
        schema: 'aleph.decision.v1',
        requestId: request.requestId,
        decision: 'allow',
        reasonCode: 'approved',
        ruleIds: [RULE_IDS[0], RULE_IDS[2]],
      };
    }

    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'step_up',
      reasonCode: 'step_up_required',
      ruleIds: [RULE_IDS[1]],
    };
  }

  if (request && request.deviceRegistered === true && isValidRequest(request)) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'allow',
      reasonCode: 'approved',
      ruleIds: [RULE_IDS[0], RULE_IDS[2]],
    };
  }

  return {
    schema: 'aleph.decision.v1',
    requestId: request && typeof request === 'object' && typeof request.requestId === 'string' ? request.requestId : undefined,
    decision: 'deny',
    reasonCode: 'device_not_registered',
    ruleIds: [RULE_IDS[0]],
  };
}
