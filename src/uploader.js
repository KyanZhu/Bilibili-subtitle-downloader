const path = require('node:path');
const fs = require('node:fs/promises');
const { downloadBatchSubtitles } = require('./batch-downloader');
const { createBilibiliClient } = require('./bilibili-client');
const { sanitizeName, sanitizeTitleFilename } = require('./downloader');
const { dateFolderName } = require('./output-paths');

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

function publishedDateFolderName(video, fallbackDate = new Date()) {
  const publishedAt = Number(video.created || video.pubdate || 0);
  const date = publishedAt > 0 ? new Date(publishedAt * 1000) : fallbackDate;
  const datePart = dateFolderName(date);
  const label = sanitizeTitleFilename(video.title || video.bvid || '');
  return label ? `${datePart}_${label}` : datePart;
}

async function downloadUploaderSubtitles(options) {
  const client = options.client || createBilibiliClient({ cookie: options.cookie });
  const uploader = await resolveUploader(options.uploader, client);
  const delayMs = Number.isFinite(Number(options.delayMs)) ? Math.max(0, Number(options.delayMs)) : 800;
  const videoList = await client.getUploaderVideos(uploader.mid, {
    pageSize: options.pageSize || 20,
    maxPages: options.maxPages || 20,
    pageDelayMs: options.pageDelayMs !== undefined ? options.pageDelayMs : Math.min(Math.max(delayMs, 800), 3000),
    delay: options.delay,
  });
  const filteredVideos = videoList.videos.filter((video) => {
    const publishedAt = Number(video.created || video.pubdate || 0);
    if (options.publishedAfter && publishedAt < options.publishedAfter) return false;
    if (options.publishedBefore && publishedAt > options.publishedBefore) return false;
    return true;
  });
  const uploaderOutputDir = path.join(options.outputDir || 'downloads', sanitizeName(uploader.name));
  const skippedVideos = [];
  const videosToDownload = [];

  for (const video of filteredVideos) {
    if (!video.bvid) {
      continue;
    }
    const folderName = options.groupByDate ? publishedDateFolderName(video, options.now) : video.bvid;
    if (options.incrementalUpdate) {
      try {
        await fs.access(path.join(uploaderOutputDir, folderName));
        skippedVideos.push(video);
        continue;
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }
    videosToDownload.push({ video, folderName });
  }

  const inputs = videosToDownload.map(({ video, folderName }) => (
    options.groupByDate
      ? { input: video.bvid, videoFolderName: folderName }
      : video.bvid
  ));
  const batch = await (options.downloadBatchSubtitles || downloadBatchSubtitles)({
    inputs,
    outputDir: uploaderOutputDir,
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
  batch.summary = {
    ...batch.summary,
    skippedExisting: skippedVideos.length,
  };

  return {
    status: batch.status,
    uploader,
    totalVideos: videoList.total,
    filteredVideos: filteredVideos.length,
    skippedExisting: skippedVideos.length,
    outputDir: uploaderOutputDir,
    batch,
  };
}

module.exports = { downloadUploaderSubtitles, parseUploaderInput, resolveUploader };
