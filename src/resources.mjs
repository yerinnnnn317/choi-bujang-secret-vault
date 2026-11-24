// 8단계: 자료실의 자원을 구역(zone)별로 나누고, 서버가 요청마다 구별할 수 있는 자원 ID를 붙인다.
// 자원 ID 모양: '<구역 접두어>:<자료 ID>'  예) note:20000000-0000-4000-8000-000000000001
// 화면 메뉴나 요청 본문의 role 은 구역 판단에 쓰지 않는다.

export const RESOURCE_ZONES = Object.freeze({
  note: Object.freeze({ prefix: 'note', service: 'notes', label: '내 메모' }),
  announcement: Object.freeze({ prefix: 'announcement', service: 'announcements', label: '반 공지' }),
  instructorMaterial: Object.freeze({ prefix: 'instructor-material', service: 'instructor', label: '강사 자료' }),
});

const BY_PREFIX = new Map(Object.entries(RESOURCE_ZONES).map(([zone, info]) => [info.prefix, zone]));

// 구역과 자료 ID로 자원 ID를 만든다. 알 수 없는 구역이나 빈 ID는 만들지 않는다.
export function resourceId(zone, id) {
  const info = RESOURCE_ZONES[zone];
  if (!info) throw new Error(`알 수 없는 자원 구역: ${String(zone)}`);
  if (typeof id !== 'string' || id.length === 0 || id.includes(':')) {
    throw new Error('자료 ID가 올바르지 않습니다.');
  }
  return `${info.prefix}:${id}`;
}

// 자원 ID를 구역과 자료 ID로 나눈다. 모양이 맞지 않으면 null.
export function parseResourceId(value) {
  if (typeof value !== 'string') return null;
  const index = value.indexOf(':');
  if (index <= 0 || index === value.length - 1) return null;
  const zone = BY_PREFIX.get(value.slice(0, index));
  const id = value.slice(index + 1);
  if (!zone || id.includes(':')) return null;
  return { zone, id };
}
