const test = require('node:test');
const assert = require('node:assert/strict');
const { createBilibiliClient } = require('../src/bilibili-client');

test('sends configured cookie and referer headers', async () => {
  const calls = [];
  const client = createBilibiliClient({
    cookie: 'SESSDATA=abc',
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ code: 0, data: [{ cid: 1 }] }) };
    },
  });

  await client.getPages('BV1Jh5d68Er3');
  assert.equal(calls[0].options.headers.Cookie, 'SESSDATA=abc');
  assert.equal(calls[0].options.headers.Referer, 'https://www.bilibili.com/video/BV1Jh5d68Er3');
});

test('normalizes protocol-relative subtitle urls', () => {
  const client = createBilibiliClient({ fetch: async () => {} });
  assert.equal(client.normalizeSubtitleUrl('//example.com/a.json'), 'https://example.com/a.json');
});

test('throws api errors with endpoint context', async () => {
  const client = createBilibiliClient({
    fetch: async () => ({ ok: true, json: async () => ({ code: -404, message: 'not found' }) }),
  });

  await assert.rejects(() => client.getPages('BV1Jh5d68Er3'), /pagelist failed: -404 not found/);
});

test('uses the wbi player endpoint for subtitle metadata', async () => {
  const calls = [];
  const client = createBilibiliClient({
    fetch: async (url) => {
      calls.push(url);
      return { ok: true, json: async () => ({ code: 0, data: {} }) };
    },
  });

  await client.getPlayerInfo('BV1Jh5d68Er3', 38332663978);
  assert.match(calls[0], /\/x\/player\/wbi\/v2\?/);
});

test('fetches video info from the view endpoint', async () => {
  const calls = [];
  const client = createBilibiliClient({
    fetch: async (url) => {
      calls.push(url);
      return { ok: true, json: async () => ({ code: 0, data: { title: 'Video Title' } }) };
    },
  });

  const info = await client.getVideoInfo('BV1Jh5d68Er3');
  assert.equal(info.title, 'Video Title');
  assert.match(calls[0], /\/x\/web-interface\/view\?/);
});
