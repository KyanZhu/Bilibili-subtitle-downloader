const fs = require('node:fs/promises');
const path = require('node:path');
const { bccToAss } = require('./ass');
const { createBilibiliClient } = require('./bilibili-client');
const { extractBvid } = require('./bvid');
const { withDateFolder } = require('./output-paths');
const { bccToPlainText } = require('./text');

function sanitizeName(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function sanitizeTitleFilename(value) {
  return sanitizeName(value).replace(/\s+/g, '_');
}

function subtitleLanguageName(subtitle) {
  return sanitizeName(subtitle.lan || subtitle.lan_doc || 'unknown') || 'unknown';
}

function audioExtension(audio) {
  const mimeType = String(audio && audio.mimeType ? audio.mimeType : '').toLowerCase();
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('mpeg')) return 'mp3';
  return 'm4s';
}

function selectBestAudio(playUrl) {
  const audioTracks = (((playUrl || {}).dash || {}).audio || []).filter((item) => item && (item.baseUrl || item.base_url));
  return audioTracks.sort((left, right) => Number(right.bandwidth || 0) - Number(left.bandwidth || 0))[0];
}

function isChineseSubtitle(subtitle) {
  const language = String(subtitle.lan || '').toLowerCase();
  const label = String(subtitle.lan_doc || '').toLowerCase();
  return language.startsWith('zh') || label.includes('中文') || label.includes('chinese') || label.includes('简体') || label.includes('繁体');
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function downloadVideoSubtitles(options) {
  const input = options.input;
  const outputDir = options.useDateFolder === false
    ? (options.outputDir || 'downloads')
    : withDateFolder(options.outputDir || 'downloads', options.now);
  const client = options.client || createBilibiliClient({ cookie: options.cookie });
  const bvid = extractBvid(input);
  const videoFolderName = sanitizeName(options.videoFolderName || bvid) || bvid;
  const videoDir = path.join(outputDir, videoFolderName);
  const subtitlesDir = path.join(videoDir, 'subtitles');
  const downloaded = [];
  const audio = [];
  const pagesMetadata = [];

  await fs.mkdir(subtitlesDir, { recursive: true });

  const needsVideoInfo = options.renameByTitle || options.collectPlainText;
  const videoInfo = needsVideoInfo && typeof client.getVideoInfo === 'function' ? await client.getVideoInfo(bvid) : null;
  const title = videoInfo && videoInfo.title ? String(videoInfo.title) : '';
  const titlePrefix = options.renameByTitle && title ? `${sanitizeTitleFilename(title)}-` : '';
  const pages = await client.getPages(bvid);
  const normalizedPages = Array.isArray(pages) ? pages : [];
  let needsAuthenticatedSubtitleAccess = false;

  for (let index = 0; index < normalizedPages.length; index += 1) {
    const page = normalizedPages[index];
    const pageNumber = Number(page.page || index + 1);
    const pageLabel = `p${String(pageNumber).padStart(2, '0')}`;
    const playerInfo = await client.getPlayerInfo(bvid, page.cid);
    if (playerInfo && playerInfo.need_login_subtitle) {
      needsAuthenticatedSubtitleAccess = true;
    }
    const allSubtitles = (((playerInfo || {}).subtitle || {}).subtitles || []).filter((item) => item && item.subtitle_url);
    const subtitles = options.chineseOnly ? allSubtitles.filter(isChineseSubtitle) : allSubtitles;
    const pageRecord = {
      page: pageNumber,
      cid: page.cid,
      part: page.part || '',
      subtitleCount: subtitles.length,
      subtitles: [],
    };

    for (const subtitle of subtitles) {
      const language = subtitleLanguageName(subtitle);
      const baseName = `${titlePrefix}${pageLabel}-${language}`;
      const jsonPath = path.join(subtitlesDir, `${baseName}.json`);
      const assPath = path.join(subtitlesDir, `${baseName}.ass`);
      const txtPath = path.join(subtitlesDir, `${baseName}.txt`);
      const bcc = await client.downloadSubtitle(subtitle.subtitle_url, bvid);

      await writeJson(jsonPath, bcc);
      await fs.writeFile(assPath, bccToAss(bcc), 'utf8');
      if (options.plainText) {
        await fs.writeFile(txtPath, bccToPlainText(bcc), 'utf8');
      }

      const record = {
        page: pageNumber,
        cid: page.cid,
        language,
        jsonPath,
        assPath,
        txtPath: options.plainText ? txtPath : undefined,
        subtitleUrl: subtitle.subtitle_url,
      };
      downloaded.push(record);
      pageRecord.subtitles.push(record);
    }

    pagesMetadata.push(pageRecord);
  }

  let status = downloaded.length > 0 ? 'downloaded' : (needsAuthenticatedSubtitleAccess ? 'auth-required' : 'no-subtitles');
  if (status === 'no-subtitles' && options.downloadAudioWhenNoSubtitles) {
    for (const page of normalizedPages) {
      const pageNumber = Number(page.page || audio.length + 1);
      const pageLabel = `p${String(pageNumber).padStart(2, '0')}`;
      const playUrl = await client.getPlayUrl(bvid, page.cid);
      const bestAudio = selectBestAudio(playUrl);
      if (!bestAudio) {
        continue;
      }
      const audioUrl = bestAudio.baseUrl || bestAudio.base_url;
      const extension = audioExtension(bestAudio);
      const audioDir = path.join(videoDir, 'audio');
      const audioPath = path.join(audioDir, `${titlePrefix}${pageLabel}-audio.${extension}`);
      await fs.mkdir(audioDir, { recursive: true });
      await fs.writeFile(audioPath, await client.downloadBinary(audioUrl, bvid));
      audio.push({
        page: pageNumber,
        cid: page.cid,
        path: audioPath,
        url: audioUrl,
        bandwidth: bestAudio.bandwidth,
        mimeType: bestAudio.mimeType,
      });
    }
    if (audio.length > 0) {
      status = 'audio-downloaded';
    }
  }
  const metadata = {
    bvid,
    title,
    owner: videoInfo && videoInfo.owner ? videoInfo.owner : undefined,
    status,
    needsAuthenticatedSubtitleAccess,
    downloadedAt: new Date().toISOString(),
    pages: pagesMetadata,
    downloaded,
    audio,
  };
  await writeJson(path.join(videoDir, 'metadata.json'), metadata);

  return metadata;
}

module.exports = { downloadVideoSubtitles, sanitizeName, sanitizeTitleFilename };
