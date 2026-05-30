const fs = require('node:fs/promises');
const path = require('node:path');
const { bccToAss } = require('./ass');
const { createBilibiliClient } = require('./bilibili-client');
const { extractBvid } = require('./bvid');
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
  const outputDir = options.outputDir || 'downloads';
  const client = options.client || createBilibiliClient({ cookie: options.cookie });
  const bvid = extractBvid(input);
  const videoDir = path.join(outputDir, bvid);
  const subtitlesDir = path.join(videoDir, 'subtitles');
  const downloaded = [];
  const pagesMetadata = [];

  await fs.mkdir(subtitlesDir, { recursive: true });

  const videoInfo = options.renameByTitle && typeof client.getVideoInfo === 'function' ? await client.getVideoInfo(bvid) : null;
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

  const status = downloaded.length > 0 ? 'downloaded' : (needsAuthenticatedSubtitleAccess ? 'auth-required' : 'no-subtitles');
  const metadata = {
    bvid,
    title,
    owner: videoInfo && videoInfo.owner ? videoInfo.owner : undefined,
    status,
    needsAuthenticatedSubtitleAccess,
    downloadedAt: new Date().toISOString(),
    pages: pagesMetadata,
    downloaded,
  };
  await writeJson(path.join(videoDir, 'metadata.json'), metadata);

  return metadata;
}

module.exports = { downloadVideoSubtitles, sanitizeName, sanitizeTitleFilename };
