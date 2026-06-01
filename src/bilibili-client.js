const { createWbiSigner, extractWbiKeyPart } = require('./wbi');

function createBilibiliClient(options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const cookie = options.cookie || '';
  let wbiSignerPromise = null;

  if (!fetchImpl) {
    throw new Error('This Node.js runtime does not provide fetch.');
  }

  function headersFor(bvid, referer) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      Referer: referer || (bvid ? `https://www.bilibili.com/video/${bvid}` : 'https://www.bilibili.com/'),
    };
    if (cookie) {
      headers.Cookie = cookie;
    }
    return headers;
  }

  async function getJson(url, bvid, label, referer) {
    const response = await fetchImpl(url, { headers: headersFor(bvid, referer) });
    if (!response.ok) {
      throw new Error(`${label} failed: HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (payload.code !== 0) {
      throw new Error(`${label} failed: ${payload.code} ${payload.message || ''}`.trim());
    }
    return payload.data;
  }

  function toQuery(params) {
    return Object.keys(params)
      .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
      .join('&');
  }

  async function getWbiSigner() {
    if (!wbiSignerPromise) {
      wbiSignerPromise = getJson('https://api.bilibili.com/x/web-interface/nav', '', 'nav').then((data) => {
        const wbiImg = data.wbi_img || {};
        return createWbiSigner({
          imgKey: extractWbiKeyPart(wbiImg.img_url),
          subKey: extractWbiKeyPart(wbiImg.sub_url),
        });
      });
    }
    return wbiSignerPromise;
  }

  async function getSignedJson(baseUrl, params, bvid, label, referer) {
    const signer = await getWbiSigner();
    const signed = signer.sign(params);
    return getJson(`${baseUrl}?${toQuery(signed)}`, bvid || '', label, referer);
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

    getVideoInfo(bvid) {
      const url = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;
      return getJson(url, bvid, 'view');
    },

    async getUploaderInfo(mid) {
      return getSignedJson('https://api.bilibili.com/x/space/wbi/acc/info', { mid }, '', 'uploader info', `https://space.bilibili.com/${mid}`);
    },

    async getUploaderVideos(mid, options = {}) {
      const pageSize = options.pageSize || 30;
      const maxPages = options.maxPages || 20;
      const videos = [];
      let total = 0;

      for (let page = 1; page <= maxPages; page += 1) {
        const data = await getSignedJson('https://api.bilibili.com/x/space/wbi/arc/search', {
          mid,
          pn: page,
          ps: pageSize,
          order: 'pubdate',
        }, '', 'uploader videos', `https://space.bilibili.com/${mid}/video`);
        const list = (((data || {}).list || {}).vlist || []);
        total = Number((((data || {}).page || {}).count) || total || list.length);
        videos.push(...list.map((item) => ({
          bvid: item.bvid,
          aid: item.aid,
          title: item.title,
          created: item.created,
        })));
        if (videos.length >= total || list.length < pageSize) {
          break;
        }
      }

      return { total, videos };
    },

    async resolveUploaderByName(name) {
      const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=bili_user&keyword=${encodeURIComponent(name)}&page=1`;
      const data = await getJson(url, '', 'user search');
      const users = Array.isArray(data.result) ? data.result : [];
      const exact = users.find((user) => user.uname === name) || users[0];
      if (!exact) {
        throw new Error(`Could not resolve uploader name: ${name}`);
      }
      return { mid: exact.mid, name: exact.uname };
    },

    getPlayerInfo(bvid, cid) {
      const url = `https://api.bilibili.com/x/player/wbi/v2?bvid=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid)}`;
      return getJson(url, bvid, 'player');
    },

    getPlayUrl(bvid, cid) {
      const url = `https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid)}&fnval=4048&fourk=1`;
      return getJson(url, bvid, 'playurl');
    },

    async downloadSubtitle(url, bvid) {
      const response = await fetchImpl(this.normalizeSubtitleUrl(url), { headers: headersFor(bvid) });
      if (!response.ok) {
        throw new Error(`subtitle download failed: HTTP ${response.status}`);
      }
      return response.json();
    },

    async downloadBinary(url, bvid) {
      const response = await fetchImpl(this.normalizeSubtitleUrl(url), { headers: headersFor(bvid) });
      if (!response.ok) {
        throw new Error(`binary download failed: HTTP ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    },
  };
}

module.exports = { createBilibiliClient };
