// 10단계: 메모 사본의 내용 해시. 제목과 내용을 함께 묶어 SHA-256으로 계산한다.
import { createHash } from 'node:crypto';

export function noteContentSha256(title, content) {
  return createHash('sha256').update(JSON.stringify([String(title), String(content)]), 'utf8').digest('hex');
}
