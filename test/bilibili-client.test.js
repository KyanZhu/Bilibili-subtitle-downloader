const test = require('node:test');
const assert = require('node:assert/strict');
const { createBilibiliClient } = require('../src/bilibili-client');

function response(data) {
  return { ok: true, json: async () => ({ code: 0, data }) };
}

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
  assert.match(calls[0].options.headers['User-Agent'], /Chrome\/125/);
  assert.equal(calls[0].options.headers.Accept, 'application/json, text/plain, */*');
});

test('uses space referer for uploader video list requests', async () => {
  const calls = [];
  const client = createBilibiliClient({
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.includes('/x/web-interface/nav')) {
        return response({
          wbi_img: {
            img_url: 'https://i0.hdslb.com/bfs/wbi/0123456789abcdef0123456789abcdef.png',
            sub_url: 'https://i0.hdslb.com/bfs/wbi/fedcba9876543210fedcba9876543210.png',
          },
        });
      }
      return response({ page: { count: 0 }, list: { vlist: [] } });
    },
  });

  await client.getUploaderVideos('1350959407', { maxPages: 1 });
  const videoListCall = calls.find((call) => call.url.includes('/x/space/wbi/arc/search'));

  assert.equal(videoListCall.options.headers.Referer, 'https://space.bilibili.com/1350959407/video');
});

test('waits between uploader video list pages when configured', async () => {
  const delays = [];
  const client = createBilibiliClient({
    fetch: async (url) => {
      if (url.includes('/x/web-interface/nav')) {
        return response({
          wbi_img: {
            img_url: 'https://i0.hdslb.com/bfs/wbi/0123456789abcdef0123456789abcdef.png',
            sub_url: 'https://i0.hdslb.com/bfs/wbi/fedcba9876543210fedcba9876543210.png',
          },
        });
      }
      if (url.includes('pn=1')) {
        return response({ page: { count: 3 }, list: { vlist: [{ bvid: 'BV1' }, { bvid: 'BV2' }] } });
      }
      return response({ page: { count: 3 }, list: { vlist: [{ bvid: 'BV3' }] } });
    },
  });

  await client.getUploaderVideos('1350959407', {
    pageSize: 2,
    maxPages: 2,
    pageDelayMs: 900,
    delay: async (ms) => delays.push(ms),
  });

  assert.deepEqual(delays, [900]);
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
