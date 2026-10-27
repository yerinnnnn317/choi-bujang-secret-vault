import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

const baseline = JSON.parse(await readFile(new URL('../package/baseline-functions.json', import.meta.url)));

test('패키징 함수 기준표는 시작 틀의 실제 API와 일치한다', async () => {
  const actual = (await readdir(new URL('../api/', import.meta.url)))
    .filter(name => /\.(?:m?js|ts)$/u.test(name))
    .map(name => join('api', name).replaceAll('\\', '/')).sort();
  assert.equal(baseline.version, 1);
  assert.equal(baseline.starter, 'ChoiTimo/aleph-defense-starter');
  assert.deepEqual(baseline.functions, []);
  assert.deepEqual(baseline.allowedNew, ['api/ai.js', 'api/notes.js', 'api/threat-intel.js']);
  assert.deepEqual(actual, [...baseline.functions, ...baseline.allowedNew].sort());
});

test.skip('이전 공개 자료 API 테스트는 인증 요구로 대체됨', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  const secret = 'unit-test-server-secret-only';
  try {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SECRET_KEY = secret;
    let requestedUrl;
    let requestHeaders;
    globalThis.fetch = async (url, options) => {
      requestedUrl = String(url);
      requestHeaders = options.headers;
      return new Response(JSON.stringify([
        { id: 'private-id', owner_id: 'private-owner', title: '가상 과제', content: '가상 기록' },
      ]), { status: 200 });
    };
    const { default: handler } = await import('../api/notes.js');
    const headers = new Map();
    let status;
    let body;
    await handler({ method: 'POST' }, {
      setHeader: (name, value) => headers.set(name.toLowerCase(), value),
      status: value => {
        status = value;
        return { json: value => { body = value; } };
      },
    });
    assert.equal(status, 405);
    assert.deepEqual(body, { error: 'METHOD_NOT_ALLOWED' });

    await handler({ method: 'GET' }, {
      setHeader: (name, value) => headers.set(name.toLowerCase(), value),
      status: value => {
        status = value;
        return { json: value => { body = value; } };
      },
    });
    assert.equal(status, 200);
    assert.equal(headers.get('cache-control'), 'no-store');
    assert.equal(new URL(requestedUrl).pathname, '/rest/v1/training_notes');
    assert.equal(requestHeaders.apikey, secret);
    assert.equal(requestHeaders.Authorization, `Bearer ${secret}`);
    assert.deepEqual(body, { notes: [{ title: '가상 과제', content: '가상 기록' }] });
    assert.doesNotMatch(JSON.stringify(body), /private-id|private-owner|unit-test-server-secret-only/u);

    globalThis.fetch = async () => new Response(JSON.stringify({ error: secret }), { status: 401 });
    await handler({ method: 'GET' }, {
      setHeader: (name, value) => headers.set(name.toLowerCase(), value),
      status: value => {
        status = value;
        return { json: value => { body = value; } };
      },
    });
    assert.equal(status, 502);
    assert.deepEqual(body, { error: 'NOTES_UNAVAILABLE' });
    assert.doesNotMatch(JSON.stringify(body), new RegExp(secret, 'u'));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalKey;
  }
});

test('자료 API는 토큰이 없거나 유효하지 않으면 자료 조회 전에 거부한다', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  const originalVercelUrl = process.env.VERCEL_URL;
  try {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'unit-test-server-secret-only';
    process.env.VERCEL_URL = 'student-defense.vercel.app';
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return new Response('unexpected request', { status: 500 });
    };
    const { default: handler } = await import('../api/notes.js');
    let status;
    let body;
    const response = {
      setHeader: () => {},
      status: value => {
        status = value;
        return { json: value => { body = value; } };
      },
    };

    await handler({ method: 'GET', url: '/api/notes' }, response);
    assert.equal(status, 401);
    assert.deepEqual(body, { error: 'UNAUTHORIZED' });

    await handler({
      method: 'GET',
      url: '/api/notes',
      headers: { authorization: 'Bearer not-a-token' },
    }, response);
    assert.equal(status, 401);
    assert.deepEqual(body, { error: 'UNAUTHORIZED' });
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalKey;
    if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = originalVercelUrl;
  }
});

test('자료 API는 설정된 Supabase 발급자 정보와 서버 검증기를 사용한다', async () => {
  const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  const api = await readFile(new URL('../api/notes.js', import.meta.url), 'utf8');
  const dynamicRoute = await readFile(new URL('../api/notes/[id].js', import.meta.url), 'utf8');
  assert.equal(config.step, 3);
  assert.deepEqual(config.allowedRoutes, [
    'GET /api/notes',
    'POST /api/notes',
    'GET /api/notes/:id',
    'PUT /api/notes/:id',
    'DELETE /api/notes/:id',
  ]);
  assert.deepEqual(config.identityProvider, {
    issuer: 'https://dwzmqgcwolnzbrbtevoa.supabase.co/auth/v1',
    audience: 'authenticated',
    jwksUrl: 'https://dwzmqgcwolnzbrbtevoa.supabase.co/auth/v1/.well-known/jwks.json',
  });
  assert.match(api, /createLoginVerifier/u);
  assert.match(api, /verifyLoginAuthorization\(authorization\)/u);
  assert.match(api, /if \(!identity\)/u);
  assert.doesNotMatch(api, /request\.(?:userId|role)/u);
  assert.match(api, /owner_id: identity\.userId/u);
  assert.match(api, /owner_id.*identity\.userId/su);
  assert.match(api, /notesUrl\.searchParams\.set\('id', `eq\.\$\{id\}`\)/u);
  assert.match(api, /randomUUID\(\)/u);
  assert.match(api, /apiError\(response, 404, 'NOT_FOUND'\)/u);
  assert.match(dynamicRoute, /from '\.\.\/notes\.js'/u);
});

test('자료 화면은 서버 API만 호출하고 정적 자료 파일을 배포하지 않는다', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const build = await readFile(new URL('../scripts/build-public.mjs', import.meta.url), 'utf8');
  assert.match(html, /fetch\('\/api\/notes'/u);
  assert.doesNotMatch(html, /SUPABASE_SECRET_KEY/u);
  assert.match(html, /@supabase\/supabase-js@2\.117\.2/u);
  assert.match(html, /signInWithPassword/u);
  assert.match(html, /supabase\.auth\.signOut/u);
  assert.match(html, /authError\.textContent = error\.message/u);
  assert.match(html, /headers: \{ Authorization:/u);
  assert.match(html, /loadNotes\(nextSession\)/u);
  assert.match(html, /note-form/u);
  assert.match(html, /method: editingId \? 'PUT' : 'POST'/u);
  assert.match(html, /method: 'DELETE'/u);
  assert.doesNotMatch(build, /writeFile\(.*data\.json/su);
  await assert.rejects(readFile(new URL('../public/data.json', import.meta.url)));
});

test('미구현 서버 뼈대는 성공이나 로그인 통과로 가장하지 않는다', async () => {
  for (const name of ['ai', 'threat-intel']) {
    const { default: handler } = await import(`../api/${name}.js`);
    const headers = new Map();
    let status;
    let body;
    handler({}, {
      setHeader: (key, value) => headers.set(key.toLowerCase(), value),
      status: value => { status = value; return { json: value => { body = value; } }; },
    });
    assert.equal(status, 501);
    assert.equal(headers.get('cache-control'), 'no-store');
    assert.match(body.error, /NOT_IMPLEMENTED$/u);
  }
});

test('P7 시작 틀 안내는 실제 빌드 조건과 새 배포 시험에 맞는다', async () => {
  const readme = await readFile(new URL('../package/README.md', import.meta.url), 'utf8');
  const selfCheck = await readFile(new URL('../package/SELF-CHECK.md', import.meta.url), 'utf8');
  assert.match(readme, /새 Vercel 프로젝트/u);
  assert.match(readme, /Vercel이 제공하는 저장소·커밋·배포 URL 정보/u);
  assert.doesNotMatch(readme, /npm start/u);
  assert.match(selfCheck, /P7-3\.png/u);
});
