function createBilibiliClient(options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const cookie = options.cookie || '';

  if (!fetchImpl) {
    throw new Error('This Node.js runtime does not provide fetch.');
  }

  function headersFor(bvid) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 BilibiliSubtitleDownloader/0.1',
      Referer: `https://www.bilibili.com/video/${bvid}`,
    };
    if (cookie) {
      headers.Cookie = cookie;
    }
    return headers;
  }

  async function getJson(url, bvid, label) {
    const response = await fetchImpl(url, { headers: headersFor(bvid) });
    if (!response.ok) {
      throw new Error(`${label} failed: HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (payload.code !== 0) {
      throw new Error(`${label} failed: ${payload.code} ${payload.message || ''}`.trim());
    }
    return payload.data;
  }

  return {
    normalizeSubtitleUrl(url) {
      if (url.startsWith('//')) {
        return `https:${url}`;
      }
      return url;
    },

    getPages(bvid) {
      const url = `https://api.bilibili.com/x/player/pagelist?bvid=${encodeURIComponent(bvid)}`;
      return getJson(url, bvid, 'pagelist');
    },

    getPlayerInfo(bvid, cid) {
      const url = `https://api.bilibili.com/x/player/wbi/v2?bvid=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid)}`;
      return getJson(url, bvid, 'player');
    },

    async downloadSubtitle(url, bvid) {
      const response = await fetchImpl(this.normalizeSubtitleUrl(url), { headers: headersFor(bvid) });
      if (!response.ok) {
        throw new Error(`subtitle download failed: HTTP ${response.status}`);
      }
      return response.json();
    },
  };
}

module.exports = { createBilibiliClient };
