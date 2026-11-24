// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계부터 등록된 기기만 자료실에 들어갈 수 있도록 규칙을 추가합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required']);

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
      || Object.keys(signals).some(key => !['source', 'region', 'network', 'hour'].includes(key))
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
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return false;
    return true;
  }

  if (source === 'none') {
    if (region !== 'unknown' || network !== 'unknown') return false;
    if (hour !== undefined && hour !== null) return false;
    return true;
  }

  return false;
}

function hasValidStepUp(stepUp) {
  if (!hasExactKeys(stepUp, STEP_UP_KEYS) || typeof stepUp.verified !== 'boolean') {
    return false;
  }
  if (stepUp.verified === false) {
    return stepUp.authAgeSeconds === null;
  }
  return Number.isInteger(stepUp.authAgeSeconds)
    && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= 900;
}

function hasValidRecentEvents(recentEvents) {
  return Array.isArray(recentEvents) && recentEvents.length <= 12
    && recentEvents.every(event => hasExactKeys(event, EVENT_KEYS)
      && typeof event.kind === 'string' && event.kind.length > 0
      && Number.isFinite(event.ageSeconds) && event.ageSeconds >= 0
      && Number.isInteger(event.count) && event.count >= 0);
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

// 갑작스러운 다량 읽기: 최근 5분 안의 읽기 사건 건수를 합쳐 10건을 넘으면 다량 읽기로 본다.
const BULK_READ_WINDOW_SECONDS = 300;
const BULK_READ_THRESHOLD = 10;
function isReadKind(kind) {
  return typeof kind === 'string' && /(^|_)read(_|$)|^read/u.test(kind);
}
function hasSuddenBulkRead(recentEvents) {
  if (!Array.isArray(recentEvents)) return false;
  const total = recentEvents
    .filter(event => event && isReadKind(event.kind) && event.ageSeconds <= BULK_READ_WINDOW_SECONDS)
    .reduce((sum, event) => sum + event.count, 0);
  return total > BULK_READ_THRESHOLD;
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
  if (request && request.deviceRegistered === true && isValidRequest(request) && hasRiskyAccessPattern(request)) {
    if (request.stepUp && request.stepUp.verified === true) {
      return {
        schema: 'aleph.decision.v1',
        requestId: request.requestId,
        decision: 'allow',
        reasonCode: 'approved',
        ruleIds: [RULE_IDS[0]],
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
      ruleIds: [RULE_IDS[0]],
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
