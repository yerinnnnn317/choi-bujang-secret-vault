// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계부터 등록된 기기만 자료실에 들어갈 수 있도록 규칙을 추가합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['starter.deny', 'device_registered', 'step_up_required']);

function hasKnownSignalSource(signals) {
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)) {
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
    if (region !== 'unknown' && region !== undefined) return false;
    if (network !== 'unknown' && network !== undefined) return false;
    return true;
  }

  return false;
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

  const region = signals.region;
  const network = signals.network;
  const hour = Number(signals.hour);
  const recentEvents = Array.isArray(request.recentEvents) ? request.recentEvents : [];
  const riskEvent = recentEvents.some((event) => {
    return event && typeof event === 'object' && event.kind === 'risk_signal'
      && Number.isFinite(Number(event.ageSeconds))
      && Number(event.ageSeconds) <= 120
      && Number.isFinite(Number(event.count))
      && Number(event.count) > 10;
  });

  const oddWindow = Number.isInteger(hour) && (hour < 4 || hour > 21);
  return (region === 'foreign' || network === 'unusual' || oddWindow) && riskEvent;
}

function isValidRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return false;
  }
  if (typeof request.requestId !== 'string' || request.requestId.length === 0) {
    return false;
  }
  if (request.deviceRegistered !== true) {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(request, 'signals') || !hasKnownSignalSource(request.signals)) {
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
        ruleIds: [RULE_IDS[1]],
      };
    }

    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'step_up',
      reasonCode: 'step_up_required',
      ruleIds: [RULE_IDS[2]],
    };
  }

  if (request && request.deviceRegistered === true && isValidRequest(request)) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'allow',
      reasonCode: 'approved',
      ruleIds: [RULE_IDS[1]],
    };
  }

  return {
    schema: 'aleph.decision.v1',
    requestId: request && typeof request === 'object' && typeof request.requestId === 'string' ? request.requestId : undefined,
    decision: 'deny',
    reasonCode: 'device_not_registered',
    ruleIds: [RULE_IDS[1]],
  };
}
