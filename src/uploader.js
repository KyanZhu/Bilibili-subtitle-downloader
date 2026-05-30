const path = require('node:path');
const { downloadBatchSubtitles } = require('./batch-downloader');
const { createBilibiliClient } = require('./bilibili-client');
const { sanitizeName } = require('./downloader');

function parseUploaderInput(input) {
  const text = String(input || '').trim();
  const spaceMatch = text.match(/space\.bilibili\.com\/(\d+)/);
  if (spaceMatch) {
    return { type: 'mid', value: spaceMatch[1] };
  }
  if (/^\d+$/.test(text)) {
    return { type: 'mid', value: text };
  }
  return { type: 'name', value: text };
}

async function resolveUploader(input, client) {
  const parsed = parseUploaderInput(input);
  if (parsed.type === 'mid') {
    const info = await client.getUploaderInfo(parsed.value);
    return {
      mid: Number(info.mid || parsed.value),
      name: info.name || parsed.value,
    };
  }

  const resolved = await client.resolveUploaderByName(parsed.value);
  return {
    mid: Number(resolved.mid),
    name: resolved.name || parsed.value,
  };
}

async function downloadUploaderSubtitles(options) {
  const client = options.client || createBilibiliClient({ cookie: options.cookie });
  const uploader = await resolveUploader(options.uploader, client);
  const videoList = await client.getUploaderVideos(uploader.mid, {
    pageSize: options.pageSize || 30,
    maxPages: options.maxPages || 20,
  });
  const filteredVideos = videoList.videos.filter((video) => {
    const publishedAt = Number(video.created || video.pubdate || 0);
    if (options.publishedAfter && publishedAt < options.publishedAfter) return false;
    if (options.publishedBefore && publishedAt > options.publishedBefore) return false;
    return true;
  });
  const inputs = filteredVideos.map((video) => video.bvid).filter(Boolean);
  const uploaderOutputDir = path.join(options.outputDir || 'downloads', sanitizeName(uploader.name));
  const batch = await (options.downloadBatchSubtitles || downloadBatchSubtitles)({
    inputs,
    outputDir: uploaderOutputDir,
    cookie: options.cookie,
    chineseOnly: options.chineseOnly,
    plainText: options.plainText,
    renameByTitle: options.renameByTitle,
    delayMs: options.delayMs,
    client,
  });

  return {
    status: batch.status,
    uploader,
    totalVideos: videoList.total,
    filteredVideos: filteredVideos.length,
    outputDir: uploaderOutputDir,
    batch,
  };
}

module.exports = { downloadUploaderSubtitles, parseUploaderInput, resolveUploader };
