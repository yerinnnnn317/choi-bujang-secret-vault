# BYTE BACK 방어전 2~5단계

1단계에서 공개했던 네 건의 메모는 모두 가상 자료입니다. 2단계에서는 Supabase 학습 테이블로 옮겼고, 3단계에서는 Auth 로그인과 메모 CRUD를, 4단계에서는 단건 메모 소유자 검사를 연결했습니다. 5단계 저장점에서는 배포 URL과 원본 API 주소를 함께 기록하고, 인증된 사용자별 자료 보안 검증을 유지합니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 5단계 검증 기록

`aleph.config.json`의 `originalApiUrl`은 Supabase 학습 메모 REST 엔드포인트를 가리키며, `vercel.json`의 `X-Content-Type-Options: nosniff` 헤더가 적용된 상태를 확인했습니다. 이 검증은 무인증·위조 토큰 요청이 JSON 401/403으로 거부되고 마지막 제출 묶음이 다시 생성되도록 유지합니다.

<!-- 2026-10-28T10:41:41Z final 5-step validation checkpoint -->

## 5단계 저장점

현재 기능은 사용자 로그인 검증, 본인 메모 목록 조회, 추가·수정·삭제, 타인 메모 차단, 그리고 원본 자료 API URL 메타 기록을 함께 유지하는 상태입니다. `aleph.config.json`의 `step`은 5이며 E2E/점검용 `publicAppUrl`과 `originalApiUrl`은 실제 배포 주소와 `/api/notes` 경로를 가리킵니다. 로컬 또는 배포 환경에서 `GET /api/notes`와 타인 메모 접근은 무인증·위조 토큰 요청에서 JSON 401/403으로 거부됩니다. 저장점 검증은 `npm run bundle`로 제출 묶음을 생성하고, 비밀값이나 실제 메모 내용을 포함하지 않도록 관리합니다.

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

`/api/notes`와 `/api/notes/:id`의 GET·POST·PUT·DELETE는 `src/verify-login.mjs`를 사용해 요청의 Supabase access token을 서버에서 검증하고, 누락·위조·만료 등 유효하지 않은 토큰은 자료 조회 전에 JSON `401`로 거부합니다. 브라우저가 보낸 사용자 ID나 역할은 신뢰하지 않습니다. 서버 비밀키는 브라우저에 전달되지 않습니다. `vercel.json`은 모든 경로(첫 화면 포함)에 `X-Content-Type-Options: nosniff`를 설정합니다.

## 3~4단계 메모 API

`aleph.config.json`의 `allowedRoutes`에는 다음 메서드·경로가 등록되어 있습니다.

- `GET /api/notes`: 검증된 로그인 사용자의 `owner_id`에 해당하는 메모 배열을 반환합니다.
- `POST /api/notes`: `{ "id"?: "UUID", "title": "...", "body": "..." }`를 저장하고 `{ "id": "..." }`를 반환합니다. ID를 생략하면 서버가 UUID를 만듭니다. `owner_id`는 검증된 토큰의 사용자 ID로 저장합니다.
- `GET /api/notes/:id`: 소유자를 확인한 뒤 `{ "id": "...", "title": "...", "body": "..." }`를 반환합니다.
- `PUT /api/notes/:id`: 소유자를 확인한 뒤 제목과 내용을 수정합니다.
- `DELETE /api/notes/:id`: 소유자를 확인한 뒤 메모를 삭제합니다.

단건 요청은 서버가 조회한 메모의 `owner_id`와 토큰 검증 결과의 사용자 ID를 비교합니다. 소유자가 다르면 API는 `403 NOTE_FORBIDDEN`과 거부 이유를 반환하고 화면에도 그 이유를 표시합니다. 메모가 없으면 `404`입니다.

## 4단계 저장점과 재실행

현재 기능은 Supabase Auth 이메일·비밀번호 로그인 및 로그아웃, 인증된 사용자별 메모 목록, 메모 추가·수정·삭제, 단건 작업의 서버 소유자 검사입니다. 다른 사용자의 메모는 GET·PUT·DELETE 모두 `403 NOTE_FORBIDDEN`으로 거부됩니다.

로컬에서 `npm ci`로 의존성을 설치한 뒤 `npm run test:package`로 회귀 테스트를 실행합니다. 앱을 확인할 때는 `npx vercel dev`를 실행하고 `/`에서 로그인해 본인 메모의 CRUD와 다른 계정 메모에 대한 거부를 확인합니다. 로컬 실행에는 Vercel에 설정한 서버 환경변수가 필요합니다.

## 배포 빌드

`vercel.json`은 정적 결과물 `public`을 배포합니다. 2단계 이후 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 빌드는 정적 `public/data.json`을 만들지 않고 오래된 파일이 있으면 제거합니다. 로컬에서 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 빌드는 배포나 Supabase SQL 실행을 증명하지 않습니다.

`main`에 배포 변경을 push한 뒤 실제 앱 주소의 `/aleph.json`에서 단계, 커밋 SHA, `publicAppUrl`이 최신 커밋과 `https://choi-bujang-secret-vault-orpin.vercel.app/`인지 확인합니다. 같은 배포의 `/api/notes`는 토큰 없는 요청과 위조 토큰 요청 모두 JSON 오류와 HTTP `401` 또는 `403`을 반환해야 합니다. `200`이면 최신 배포가 적용되지 않은 것이므로 점검 통과로 기록하지 않습니다.

Vercel 배포가 막혀 로컬 서버에서만 확인할 때는 `ALEPH_CHECK_URL=http://127.0.0.1:3000/` 환경변수를 지정한 뒤 `npm run bundle`을 실행합니다. 이 설정은 `localhost`, `127.0.0.1`, `[::1]` 주소만 허용하며 제출물의 점검 결과에 로컬 요청임을 표시합니다. 로컬 점검은 원격 배포의 갱신이나 검증을 의미하지 않습니다.

로컬 번들 검증은 Vercel 배포 상태와 별개로, 실제 서버 API의 무인증·위조 토큰 401 응답을 제출 묶음에 기록하는 절차입니다.

## 4단계 저장점

현재 기능은 로그인한 사용자의 메모만 읽기·추가·수정·삭제하며, 서버가 검증한 사용자 ID와 메모 `owner_id`를 비교해 다른 사용자의 메모를 차단합니다. `POST`에서는 `owner_id`를 HTTP 요청값 대신 검증된 사용자 ID로 저장하고, `PUT`/`DELETE`는 기존 행과 새 행의 소유자가 모두 본인인지 확인합니다. `GET /api/notes`, `POST /api/notes`, `GET /api/notes/:id`, `PUT /api/notes/:id`, `DELETE /api/notes/:id`는 `aleph.config.json`의 `allowedRoutes`와 일치합니다. 로컬에서 다시 확인할 때는 `npm run test:package`를 먼저 실행하고, 실제 앱은 `npx vercel dev`로 로그인·본인 메모 CRUD·타인 메모 거부를 검증합니다.

## 가상 메모 노출 확인 및 기록

최신 배포와 GitHub 기본 브랜치의 최신 커밋을 각각 확인합니다. 검색할 문장은 [supabase/step-2-training-notes.sql](supabase/step-2-training-notes.sql)의 네 `content` 값입니다.

1. Vercel 대시보드에서 **Production의 최신 배포**를 열고 배포 ID와 URL을 기록합니다. 해당 배포의 정적 파일 목록/출력에서 네 문장을 각각 검색합니다. 정적 파일 검색 결과는 모두 미일치가 기대값입니다. 배포 URL의 `/data.json`도 직접 열어 메모가 없음을 확인합니다(파일이 없어 404일 수도 있습니다). 화면에 카드가 보이는 것은 서버 API 응답 결과이므로 정적 파일 검색과 구분합니다.
2. GitHub에서 저장소의 기본 브랜치 최신 커밋을 열어 커밋 SHA를 기록합니다. 저장소 범위의 코드 검색에서 네 문장을 각각 찾아 결과 경로를 기록합니다. 최신 파일에서는 SQL seed인 `supabase/step-2-training-notes.sql`만 일치하는 것이 기대값입니다. `public/`, `data.json`, 화면 파일 또는 다른 정적 산출물에서 일치하면 노출로 기록하고 조치가 필요합니다.
3. `/api/notes`는 요청 토큰을 검증합니다. 로그인 없이 호출하면 자료가 반환되지 않아야 합니다. 목록은 로그인한 사용자의 메모만 반환하며, 단건 GET·PUT·DELETE는 소유자가 아닌 계정에 `403 NOTE_FORBIDDEN`으로 거부되어야 합니다.

확인 결과는 아래 표에 실제 검색 후 작성합니다. 아직 확인하지 않은 값은 `미확인`으로 둡니다. 검색어 대신 가상 메모 본문을 복사해 로그나 제출 기록에 남기지 마세요.

| 확인 대상 | 배포 ID/커밋 SHA | 검색 결과(일치 경로 또는 상태) | 판정/남은 약점 |
|---|---|---|---|
| 최신 Production 배포의 정적 파일 | 미확인 | 미확인 | 정적 파일에서 네 문장 미일치가 기대값 |
| GitHub 기본 브랜치 최신 커밋 | 미확인 | 미확인 | SQL seed 경로 외 일치가 없어야 함 |
| 인증된 `/api/notes` 응답 | 미확인 | 미확인 | 무로그인·타인 소유 메모 요청은 거부되어야 함 |

현재 배포와 최신 커밋에서 일치가 없더라도 과거 노출이 해소되었다는 뜻은 아닙니다. 옛 공개 커밋과 옛 배포가 남아 있는 한 과거 자료 노출은 해결됐다고 쓰지 마세요. 이 확인은 과거 커밋이나 배포의 삭제·접근성 검증을 대신하지 않습니다.

## 다음 단계

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 이후 단계에서는 API 허용 경로, 원본 API 주소, 정책 규칙 및 실제 서버 접근 제어를 각 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 있습니다.

