const path = require('node:path');
const { downloadBatchSubtitles } = require('./batch-downloader');
const { createBilibiliClient } = require('./bilibili-client');
const { sanitizeName } = require('./downloader');

function parseSeasonInput(input) {
  const text = String(input || '').trim();
  const urlMatch = text.match(/space\.bilibili\.com\/(\d+)\/lists\/(\d+)/);
  if (urlMatch) {
    return {
      mid: urlMatch[1],
      seasonId: urlMatch[2],
      url: text,
    };
  }

  const pairMatch = text.match(/^(\d+)[,\s]+(\d+)$/);
  if (pairMatch) {
    return {
      mid: pairMatch[1],
      seasonId: pairMatch[2],
      url: `https://space.bilibili.com/${pairMatch[1]}/lists/${pairMatch[2]}?type=season`,
    };
  }

  throw new Error('Season URL must look like https://space.bilibili.com/{mid}/lists/{season_id}?type=season');
}

async function getSeasonVideos(client, parsed, options = {}) {
  const pageSize = options.pageSize || 100;
  const maxPages = options.maxPages || 20;
  const videos = [];
  let meta = null;
  let total = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const data = await client.getSeasonArchives(parsed.mid, parsed.seasonId, {
      pageNum: page,
      pageSize,
      referer: parsed.url,
    });
    meta = meta || data.meta || null;
    const archives = Array.isArray(data.archives) ? data.archives : [];
    total = Number(((data.page || {}).total) || (meta && meta.total) || total || archives.length);
    videos.push(...archives.map((item) => ({
      bvid: item.bvid,
      aid: item.aid,
      title: item.title,
      pubdate: item.pubdate,
      created: item.pubdate || item.ctime,
    })).filter((item) => item.bvid));

    if (videos.length >= total || archives.length < pageSize) {
      break;
    }
  }

  return {
    meta: meta || {},
    total,
    videos,
  };
}

async function downloadSeasonSubtitles(options) {
  const parsed = parseSeasonInput(options.input);
  const client = options.client || createBilibiliClient({ cookie: options.cookie });
  const season = await getSeasonVideos(client, parsed, {
    pageSize: options.pageSize,
    maxPages: options.maxPages,
  });
  const filteredVideos = season.videos.filter((video) => {
    const publishedAt = Number(video.pubdate || video.created || 0);
    if (options.publishedAfter && publishedAt < options.publishedAfter) return false;
    if (options.publishedBefore && publishedAt > options.publishedBefore) return false;
    return true;
  });
  const seasonTitle = sanitizeName(season.meta.title || season.meta.name || parsed.seasonId) || parsed.seasonId;
  const outputDir = path.join(options.outputDir || 'downloads', seasonTitle);
  const inputs = filteredVideos.map((video) => video.bvid);
  const batch = await (options.downloadBatchSubtitles || downloadBatchSubtitles)({
    inputs,
    outputDir,
    cookie: options.cookie,
    chineseOnly: options.chineseOnly,
    plainText: options.plainText,
    renameByTitle: options.renameByTitle,
    collectPlainText: options.collectPlainText,
    downloadAudioWhenNoSubtitles: options.downloadAudioWhenNoSubtitles,
    useDateFolder: false,
    delayMs: options.delayMs,
    onProgress: options.onProgress,
    client,
  });

  return {
    status: batch.status,
    season: {
      mid: Number(parsed.mid),
      seasonId: Number(parsed.seasonId),
      title: season.meta.title || season.meta.name || '',
      total: season.total,
    },
    totalVideos: season.total,
    filteredVideos: filteredVideos.length,
    outputDir,
    batch,
  };
}

module.exports = {
  downloadSeasonSubtitles,
  getSeasonVideos,
  parseSeasonInput,
};
