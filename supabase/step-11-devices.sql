-- 11단계: 승인된 기기 목록 (서버 전용).
-- Supabase SQL Editor 에서 한 번 실행합니다. 브라우저(anon·authenticated)는 이 표에 접근할 수 없습니다.
-- 저장하는 것은 기기 공개키뿐입니다. 기기 개인키·로그인 토큰은 저장하지 않습니다.
create table if not exists public.device_approvals (
  device_id text primary key check (device_id ~ '^[0-9a-f]{16}$'),
  owner_id uuid not null,
  public_key_jwk jsonb not null,
  status text not null check (status in ('approved', 'revoked')),
  approved_at timestamptz not null default now()
);

alter table public.device_approvals enable row level security;
revoke all privileges on table public.device_approvals from anon, authenticated, public;
