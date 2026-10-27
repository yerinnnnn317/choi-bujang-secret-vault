# BYTE BACK 방어전 2~3단계

1단계에서 공개했던 네 건의 메모는 모두 가상 자료입니다. 2단계에서는 이 자료를 Supabase 학습 테이블로 옮겼고, 3단계에서는 Supabase Auth 로그인과 사용자 메모 CRUD를 연결합니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 2단계 적용 순서

1. Supabase 대시보드의 SQL Editor에서 아래 학습 SQL을 실행합니다.
2. Vercel 프로젝트에 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY` 환경변수를 설정합니다. 실제 비밀값은 코드나 대화에 붙여넣지 않습니다.
3. Vercel에 재배포한 뒤 `/`에서 로그인해 메모를 추가하고, `/data.json`에 메모가 없으며 `/aleph.json`이 생성됐는지 확인합니다.

1단계에서는 `/`와 `/data.json`에서 가상 메모가 공개되었습니다. 현재 화면은 Supabase Auth 로그인·로그아웃 상태를 표시하고, 로그인 사용자의 메모를 목록으로 보여 주며 추가·수정·삭제할 수 있습니다. 정적 `public/data.json`은 생성하지 않으므로 `/data.json`에서 메모를 읽을 수 없습니다.

## 2단계 자료 이동

Supabase 대시보드의 **SQL Editor**에서 [supabase/step-2-training-notes.sql](supabase/step-2-training-notes.sql) 전체를 실행합니다. 스크립트는 `public.training_notes`를 만들고 네 건의 가상 메모를 넣습니다. `owner_id`는 nullable `uuid`이며 `auth.users` 외래키를 만들지 않습니다. RLS를 켜고 `anon`, `authenticated`, `PUBLIC`의 테이블 권한을 회수하며 읽기 정책은 추가하지 않습니다.

SQL 실행 뒤 Table Editor에서 `training_notes.owner_id` 형식이 `uuid`인지, 테이블의 RLS가 켜져 있는지 확인합니다. 로그인한 사용자의 메모는 서버 함수가 읽고, 새 메모의 소유자 ID는 검증된 로그인에서 가져옵니다.

## Vercel 서버 환경변수와 공개 API 주의

Vercel 프로젝트의 **Settings → Environment Variables**에서 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`를 설정하고 재배포하세요. 실제 키를 소스 코드, 브라우저 파일, 응답, 로그에 넣지 마세요. 값이 필요하면 Vercel의 비밀 입력란에 직접 입력합니다. 서버 함수는 이 키로 테이블을 조회하고 브라우저에는 제목·내용만 반환합니다.

화면의 Supabase Auth 이메일·비밀번호 로그인과 로그아웃은 공식 JavaScript SDK의 세션 기능을 사용합니다. 브라우저에 포함된 Supabase Project URL과 publishable key는 공개 설정값이며, 비밀번호와 세션 토큰을 코드에서 만들지 않습니다.

`/api/notes`는 `src/verify-login.mjs`를 사용해 요청의 Supabase access token을 서버에서 검증하고, 누락·무효 토큰은 `401`로 거부합니다. 브라우저가 보낸 사용자 ID나 역할은 신뢰하지 않습니다. 서버 비밀키는 브라우저에 전달되지 않습니다.

## 3단계 메모 API

`aleph.config.json`의 `allowedRoutes`에는 다음 메서드·경로가 등록되어 있습니다.

- `GET /api/notes`: 검증된 로그인 사용자의 메모 배열을 반환합니다.
- `POST /api/notes`: `{ "id"?: "UUID", "title": "...", "body": "..." }`를 저장하고 `{ "id": "..." }`를 반환합니다. ID를 생략하면 서버가 UUID를 만듭니다. `owner_id`는 검증된 토큰의 사용자 ID로 저장합니다.
- `GET /api/notes/:id`: `{ "id": "...", "title": "...", "body": "..." }`를 반환하고, 없는 ID는 `404`입니다.
- `PUT /api/notes/:id`: 제목과 내용을 수정합니다.
- `DELETE /api/notes/:id`: 메모를 삭제합니다. 삭제된 ID를 다시 GET하면 `404`입니다.

**다음 단계에서 고칠 접근 제어 약점:** 목록은 로그인 사용자의 `owner_id`로 필터링하지만, 단건 GET·PUT·DELETE는 현재 ID만 검사합니다. 따라서 다른 사용자가 메모 UUID를 알면 읽거나 수정·삭제할 수 있습니다. 4단계에서 소유자 검사를 추가해야 합니다.

## 배포 빌드

`vercel.json`은 정적 결과물 `public`을 배포합니다. 2단계 이후 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 빌드는 정적 `public/data.json`을 만들지 않고 오래된 파일이 있으면 제거합니다. 로컬에서 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 빌드는 배포나 Supabase SQL 실행을 증명하지 않습니다.

## 가상 메모 노출 확인 및 기록

최신 배포와 GitHub 기본 브랜치의 최신 커밋을 각각 확인합니다. 검색할 문장은 [supabase/step-2-training-notes.sql](supabase/step-2-training-notes.sql)의 네 `content` 값입니다.

1. Vercel 대시보드에서 **Production의 최신 배포**를 열고 배포 ID와 URL을 기록합니다. 해당 배포의 정적 파일 목록/출력에서 네 문장을 각각 검색합니다. 정적 파일 검색 결과는 모두 미일치가 기대값입니다. 배포 URL의 `/data.json`도 직접 열어 메모가 없음을 확인합니다(파일이 없어 404일 수도 있습니다). 화면에 카드가 보이는 것은 서버 API 응답 결과이므로 정적 파일 검색과 구분합니다.
2. GitHub에서 저장소의 기본 브랜치 최신 커밋을 열어 커밋 SHA를 기록합니다. 저장소 범위의 코드 검색에서 네 문장을 각각 찾아 결과 경로를 기록합니다. 최신 파일에서는 SQL seed인 `supabase/step-2-training-notes.sql`만 일치하는 것이 기대값입니다. `public/`, `data.json`, 화면 파일 또는 다른 정적 산출물에서 일치하면 노출로 기록하고 조치가 필요합니다.
3. `/api/notes`는 요청 토큰을 검증합니다. 로그인 없이 호출하면 자료가 반환되지 않아야 합니다. 로그인 상태에서 목록 API는 해당 사용자의 메모 배열을 반환하며, 단건 작업의 소유자 검사는 아직 구현되지 않았습니다.

확인 결과는 아래 표에 실제 검색 후 작성합니다. 아직 확인하지 않은 값은 `미확인`으로 둡니다. 검색어 대신 가상 메모 본문을 복사해 로그나 제출 기록에 남기지 마세요.

| 확인 대상 | 배포 ID/커밋 SHA | 검색 결과(일치 경로 또는 상태) | 판정/남은 약점 |
|---|---|---|---|
| 최신 Production 배포의 정적 파일 | 미확인 | 미확인 | 정적 파일에서 네 문장 미일치가 기대값 |
| GitHub 기본 브랜치 최신 커밋 | 미확인 | 미확인 | SQL seed 경로 외 일치가 없어야 함 |
| 인증된 `/api/notes` 응답 | 미확인 | 미확인 | 무로그인 요청은 거부, 단건 소유자 검사는 다음 단계 |

현재 배포와 최신 커밋에서 일치가 없더라도 과거 노출이 해소되었다는 뜻은 아닙니다. 옛 공개 커밋과 옛 배포가 남아 있는 한 과거 자료 노출은 해결됐다고 쓰지 마세요. 이 확인은 과거 커밋이나 배포의 삭제·접근성 검증을 대신하지 않습니다.

## 다음 단계

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 이후 단계에서는 API 허용 경로, 원본 API 주소, 정책 규칙 및 실제 서버 접근 제어를 각 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 있습니다.
