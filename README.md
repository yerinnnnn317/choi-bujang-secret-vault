# BYTE BACK 방어전 2단계

1단계에서 공개했던 네 건의 메모는 모두 가상 자료입니다. 2단계에서는 이 자료를 Supabase 학습 테이블로 옮깁니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 2단계 적용 순서

1. Supabase 대시보드의 SQL Editor에서 아래 학습 SQL을 실행합니다.
2. Vercel 프로젝트에 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY` 환경변수를 설정합니다. 실제 비밀값은 코드나 대화에 붙여넣지 않습니다.
3. Vercel에 재배포한 뒤 `/`에서 네 카드를 확인하고, `/data.json`에 메모가 없으며 `/aleph.json`이 생성됐는지 확인합니다.

1단계에서는 `/`와 `/data.json`에서 가상 메모가 공개되었습니다. 현재 화면은 `/api/notes` 서버 함수를 통해 Supabase의 학습 자료를 읽습니다. 정적 `public/data.json`은 생성하지 않으므로 `/data.json`에서 메모를 읽을 수 없습니다.

## 2단계 자료 이동

Supabase 대시보드의 **SQL Editor**에서 [supabase/step-2-training-notes.sql](supabase/step-2-training-notes.sql) 전체를 실행합니다. 스크립트는 `public.training_notes`를 만들고 네 건의 가상 메모를 넣습니다. `owner_id`는 nullable `uuid`이며 `auth.users` 외래키를 만들지 않습니다. RLS를 켜고 `anon`, `authenticated`, `PUBLIC`의 테이블 권한을 회수하며 읽기 정책은 추가하지 않습니다.

SQL 실행 뒤 Table Editor에서 `training_notes.owner_id` 형식이 `uuid`인지, 테이블의 RLS가 켜져 있는지 확인합니다. 앱은 서버 함수가 테이블의 네 건을 읽어 화면에 표시합니다.

## Vercel 서버 환경변수와 공개 API 주의

Vercel 프로젝트의 **Settings → Environment Variables**에서 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`를 설정하고 재배포하세요. 실제 키를 소스 코드, 브라우저 파일, 응답, 로그에 넣지 마세요. 값이 필요하면 Vercel의 비밀 입력란에 직접 입력합니다. 서버 함수는 이 키로 테이블을 조회하고 브라우저에는 제목·내용만 반환합니다.

`/api/notes`는 현재 로그인 확인 없이 공개된 주소입니다. 주소를 아는 누구나 호출해 네 건의 가상 메모를 읽을 수 있습니다. 서버 비밀키는 응답에 포함되지 않지만, 공개 API 자체는 자료 노출 약점이며 접근 제어는 이후 단계에서 추가해야 합니다. 공개 키 요청 및 이 약점은 심판 확인 대상입니다.

## 배포 빌드

`vercel.json`은 정적 결과물 `public`을 배포합니다. 2단계 이후 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 빌드는 정적 `public/data.json`을 만들지 않고 오래된 파일이 있으면 제거합니다. 로컬에서 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 빌드는 배포나 Supabase SQL 실행을 증명하지 않습니다.

## 가상 메모 노출 확인 및 기록

최신 배포와 GitHub 기본 브랜치의 최신 커밋을 각각 확인합니다. 검색할 문장은 [supabase/step-2-training-notes.sql](supabase/step-2-training-notes.sql)의 네 `content` 값입니다.

1. Vercel 대시보드에서 **Production의 최신 배포**를 열고 배포 ID와 URL을 기록합니다. 해당 배포의 정적 파일 목록/출력에서 네 문장을 각각 검색합니다. 정적 파일 검색 결과는 모두 미일치가 기대값입니다. 배포 URL의 `/data.json`도 직접 열어 메모가 없음을 확인합니다(파일이 없어 404일 수도 있습니다). 화면에 카드가 보이는 것은 서버 API 응답 결과이므로 정적 파일 검색과 구분합니다.
2. GitHub에서 저장소의 기본 브랜치 최신 커밋을 열어 커밋 SHA를 기록합니다. 저장소 범위의 코드 검색에서 네 문장을 각각 찾아 결과 경로를 기록합니다. 최신 파일에서는 SQL seed인 `supabase/step-2-training-notes.sql`만 일치하는 것이 기대값입니다. `public/`, `data.json`, 화면 파일 또는 다른 정적 산출물에서 일치하면 노출로 기록하고 조치가 필요합니다.
3. `/api/notes`는 인증 없이 공개되어 있으므로 문장 검색 시 네 건의 가상 메모가 응답에 나타나는 것이 현재 남은 약점입니다. 이를 정적 파일 검색 결과와 별도로 기록합니다. 이 API가 공개된 상태에서는 메모가 보호된 것으로 판정하지 않습니다.

확인 결과는 아래 표에 실제 검색 후 작성합니다. 아직 확인하지 않은 값은 `미확인`으로 둡니다. 검색어 대신 가상 메모 본문을 복사해 로그나 제출 기록에 남기지 마세요.

| 확인 대상 | 배포 ID/커밋 SHA | 검색 결과(일치 경로 또는 상태) | 판정/남은 약점 |
|---|---|---|---|
| 최신 Production 배포의 정적 파일 | 미확인 | 미확인 | 정적 파일에서 네 문장 미일치가 기대값 |
| GitHub 기본 브랜치 최신 커밋 | 미확인 | 미확인 | SQL seed 경로 외 일치가 없어야 함 |
| 공개 `/api/notes` 응답 | 미확인 | 미확인 | 인증 없이 네 메모가 반환되는 약점이 남음 |

현재 배포와 최신 커밋에서 일치가 없더라도 과거 노출이 해소되었다는 뜻은 아닙니다. 옛 공개 커밋과 옛 배포가 남아 있는 한 과거 자료 노출은 해결됐다고 쓰지 마세요. 이 확인은 과거 커밋이나 배포의 삭제·접근성 검증을 대신하지 않습니다.

## 다음 단계

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 이후 단계의 로그인, 허용 경로, 원본 API 주소, 정책 규칙은 각 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 있습니다.
