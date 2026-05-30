const { downloadVideoSubtitles } = require('./downloader');

function parseBatchInputs(value) {
  const seen = new Set();
  const inputs = [];
  for (const item of String(value || '').split(/\r?\n/)) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    inputs.push(trimmed);
  }
  return inputs;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarize(results) {
  const summary = {
    total: results.length,
    downloaded: 0,
    audioDownloaded: 0,
    noSubtitles: 0,
    authRequired: 0,
    errors: 0,
    failedVideos: [],
  };

  for (const result of results) {
    if (result.status === 'downloaded') summary.downloaded += 1;
    if (result.status === 'audio-downloaded') summary.audioDownloaded += 1;
    if (result.status === 'no-subtitles') summary.noSubtitles += 1;
    if (result.status === 'auth-required') summary.authRequired += 1;
    if (result.status === 'error') {
      summary.errors += 1;
      summary.failedVideos.push({
        input: result.input || result.bvid || '',
        url: result.input && result.input.startsWith('BV') ? `https://www.bilibili.com/video/${result.input}` : (result.input || ''),
        error: result.error || '',
      });
    }
  }

  return summary;
}

async function downloadBatchSubtitles(options) {
  const inputs = Array.isArray(options.inputs) ? options.inputs : parseBatchInputs(options.inputs);
  const delayMs = Number.isFinite(Number(options.delayMs)) ? Math.max(0, Number(options.delayMs)) : 800;
  const delay = options.delay || wait;
  const runDownload = options.downloadVideoSubtitles || downloadVideoSubtitles;
  const results = [];

  for (let index = 0; index < inputs.length; index += 1) {
    const item = inputs[index];
    const input = typeof item === 'string' ? item : item.input;
    try {
      results.push(await runDownload({
        input,
        outputDir: item.outputDir || options.outputDir,
        cookie: options.cookie,
        chineseOnly: options.chineseOnly,
        plainText: options.plainText,
        renameByTitle: options.renameByTitle,
        downloadAudioWhenNoSubtitles: options.downloadAudioWhenNoSubtitles,
        useDateFolder: item.useDateFolder !== undefined ? item.useDateFolder : options.useDateFolder,
        videoFolderName: item.videoFolderName,
        now: item.now || options.now,
        client: options.client,
      }));
    } catch (error) {
      results.push({
        input,
        status: 'error',
        error: error.message || String(error),
      });
    }

    if (index < inputs.length - 1 && delayMs > 0) {
      await delay(delayMs);
    }
  }

  return {
    status: 'completed',
    startedAt: new Date().toISOString(),
    strategy: {
      concurrency: 1,
      delayMs,
    },
    summary: summarize(results),
    results,
  };
}

module.exports = { downloadBatchSubtitles, parseBatchInputs, summarize };
