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
    noSubtitles: 0,
    authRequired: 0,
    errors: 0,
  };

  for (const result of results) {
    if (result.status === 'downloaded') summary.downloaded += 1;
    if (result.status === 'no-subtitles') summary.noSubtitles += 1;
    if (result.status === 'auth-required') summary.authRequired += 1;
    if (result.status === 'error') summary.errors += 1;
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
    const input = inputs[index];
    try {
      results.push(await runDownload({
        input,
        outputDir: options.outputDir,
        cookie: options.cookie,
        chineseOnly: options.chineseOnly,
        plainText: options.plainText,
        renameByTitle: options.renameByTitle,
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
