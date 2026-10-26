export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    return response.status(500).json({ error: 'NOTES_UNAVAILABLE' });
  }

  if (!URL.canParse(supabaseUrl)) {
    return response.status(500).json({ error: 'NOTES_UNAVAILABLE' });
  }
  const baseUrl = new URL(supabaseUrl);
  if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password
      || baseUrl.search || baseUrl.hash || baseUrl.pathname !== '/') {
    return response.status(500).json({ error: 'NOTES_UNAVAILABLE' });
  }

  const notesUrl = new URL('/rest/v1/training_notes', baseUrl);
  notesUrl.searchParams.set('select', 'title,content');
  notesUrl.searchParams.set('order', 'id.asc');
  const result = await fetch(notesUrl, {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
    },
    cache: 'no-store',
  });

  if (!result.ok) {
    return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
  }

  const rows = await result.json();
  if (!Array.isArray(rows) || rows.some(row =>
    typeof row.title !== 'string' || typeof row.content !== 'string')) {
    return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
  }

  const notes = rows.map(({ title, content }) => ({ title, content }));
  return response.status(200).json({ notes });
}
