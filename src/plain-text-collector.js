const fs = require('node:fs/promises');
const path = require('node:path');
const { dateFolderName } = require('./output-paths');

function normalizeSubtitleText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function collectVideoResults(payload, videos = []) {
  if (!payload || typeof payload !== 'object') {
    return videos;
  }

  if (payload.bvid && Array.isArray(payload.downloaded)) {
    videos.push(payload);
    return videos;
  }

  if (Array.isArray(payload.results)) {
    for (const item of payload.results) {
      if (item && item.result) {
        collectVideoResults(item.result, videos);
      } else {
        collectVideoResults(item, videos);
      }
    }
  }

  if (payload.batch) {
    collectVideoResults(payload.batch, videos);
  }

  return videos;
}

function videoDirFromTxtPath(txtPath) {
  return path.dirname(path.dirname(txtPath));
}

async function collectPlainTextEntries(payload) {
  const videos = collectVideoResults(payload);
  const entries = [];

  for (const video of videos) {
    const parts = [];
    const txtPaths = [];
    for (const subtitle of video.downloaded || []) {
      if (!subtitle.txtPath) {
        continue;
      }
      const content = normalizeSubtitleText(await fs.readFile(subtitle.txtPath, 'utf8'));
      if (content) {
        parts.push(content);
        txtPaths.push(subtitle.txtPath);
      }
    }
    if (parts.length > 0) {
      entries.push({
        title: video.title || video.bvid || '',
        id: video.bvid || '',
        text: parts.join(' '),
        videoDir: videoDirFromTxtPath(txtPaths[0]),
      });
    }
  }

  return entries;
}

async function writeCollectedPlainText(payload, options = {}) {
  const entries = await collectPlainTextEntries(payload);
  if (entries.length === 0) return null;

  const outputDir = options.outputDir || 'downloads';
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${dateFolderName(options.now || new Date())}.txt`);
  const content = entries.map((entry) => [
    `标题: ${entry.title || entry.id}`,
    `ID: ${entry.id}`,
    `字幕: ${entry.text}`,
  ].join('\n')).join('\n\n');
  await fs.writeFile(filePath, `${content}\n`, 'utf8');
  return filePath;
}

module.exports = {
  collectPlainTextEntries,
  normalizeSubtitleText,
  writeCollectedPlainText,
};
