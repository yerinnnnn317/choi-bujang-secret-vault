-- 10단계: 비공개 가상 메모 사본과 복원 감사 기록 (서버 전용).
-- Supabase SQL Editor 에서 한 번 실행합니다. 브라우저(anon·authenticated)는 두 표에 접근할 수 없습니다.

-- 메모를 처음 만들 때 저장한 사본. 같은 ID의 사본은 처음 것만 남깁니다(변조된 내용으로 덮어쓰지 않음).
create table if not exists public.training_notes_backup (
  id uuid primary key,
  owner_id uuid not null,
  title text not null,
  content text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  backed_up_at timestamptz not null default now()
);

-- 복원 감사 기록. 덧붙이기만 하고 지우거나 고치지 않습니다.
create table if not exists public.training_notes_restore_audit (
  seq bigint generated always as identity primary key,
  note_id uuid not null,
  owner_id uuid not null,
  content_sha256 text not null,
  action text not null,
  result text not null,
  at timestamptz not null default now()
);

alter table public.training_notes_backup enable row level security;
alter table public.training_notes_restore_audit enable row level security;

revoke all privileges on table public.training_notes_backup from anon, authenticated, public;
revoke all privileges on table public.training_notes_restore_audit from anon, authenticated, public;
