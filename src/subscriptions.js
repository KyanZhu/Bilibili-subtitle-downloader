const fs = require('node:fs/promises');
const path = require('node:path');
const { createBilibiliClient } = require('./bilibili-client');
const { downloadUploaderSubtitles } = require('./uploader');
const { resolveUploader } = require('./uploader');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultSubscriptionsPath() {
  return path.join(process.cwd(), 'subscriptions.json');
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeSubscriptions(filePath, subscriptions) {
  await fs.writeFile(filePath, `${JSON.stringify(subscriptions, null, 2)}\n`, 'utf8');
}

function parseSubscriptionInputs(value) {
  const seen = new Set();
  const inputs = [];
  for (const item of String(value || '').split(/[\n\r,，]+/)) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    inputs.push(trimmed);
  }
  return inputs;
}

async function listSubscriptions(options = {}) {
  const subscriptionsPath = options.subscriptionsPath || defaultSubscriptionsPath();
  const list = await readJson(subscriptionsPath);
  return Array.isArray(list) ? list : [];
}

async function addSubscription(options) {
  const subscriptionsPath = options.subscriptionsPath || defaultSubscriptionsPath();
  const input = String(options.input || '').trim();
  if (!input) {
    throw new Error('Subscription uploader input is required.');
  }
  const client = options.client || createBilibiliClient({ cookie: options.cookie });
  const uploader = await resolveUploader(input, client);
  const subscriptions = await listSubscriptions({ subscriptionsPath });
  const item = {
    mid: Number(uploader.mid),
    name: uploader.name,
    input,
    enabled: true,
    updatedAt: null,
  };
  const next = subscriptions.filter((subscription) => Number(subscription.mid) !== item.mid);
  next.push(item);
  await writeSubscriptions(subscriptionsPath, next);
  return item;
}

async function addSubscriptions(options) {
  const inputs = parseSubscriptionInputs(options.input);
  const results = [];

  for (const input of inputs) {
    try {
      const item = await addSubscription({
        ...options,
        input,
      });
      results.push({ input, status: 'added', item });
    } catch (error) {
      results.push({
        input,
        status: 'error',
        error: error.message || String(error),
      });
    }
  }

  return {
    status: 'completed',
    summary: {
      total: inputs.length,
      added: results.filter((result) => result.status === 'added').length,
      errors: results.filter((result) => result.status === 'error').length,
    },
    results,
  };
}

async function removeSubscription(options) {
  const subscriptionsPath = options.subscriptionsPath || defaultSubscriptionsPath();
  const mid = Number(options.mid);
  const subscriptions = await listSubscriptions({ subscriptionsPath });
  const next = subscriptions.filter((subscription) => Number(subscription.mid) !== mid);
  await writeSubscriptions(subscriptionsPath, next);
  return { removed: subscriptions.length - next.length };
}

async function updateSubscriptions(options = {}) {
  const subscriptionsPath = options.subscriptionsPath || defaultSubscriptionsPath();
  const subscriptions = await listSubscriptions({ subscriptionsPath });
  const enabled = subscriptions.filter((subscription) => subscription.enabled !== false);
  const runDownload = options.downloadUploaderSubtitles || downloadUploaderSubtitles;
  const delay = options.delay || wait;
  const delayMs = Number.isFinite(Number(options.delayMs)) ? Math.max(0, Number(options.delayMs)) : 800;
  const retryCount = Number.isFinite(Number(options.retryCount)) ? Math.max(0, Number(options.retryCount)) : 2;
  const retryStepMs = Number.isFinite(Number(options.retryStepMs)) ? Math.max(0, Number(options.retryStepMs)) : 300;
  const onProgress = options.onProgress || (() => {});
  const results = [];

  for (let index = 0; index < enabled.length; index += 1) {
    const subscription = enabled[index];
    let item;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        const result = await runDownload({
          uploader: String(subscription.mid || subscription.input),
          outputDir: options.outputDir,
          cookie: options.cookie,
          chineseOnly: options.chineseOnly,
          plainText: options.plainText,
          renameByTitle: options.renameByTitle,
          collectPlainText: options.collectPlainText,
          downloadAudioWhenNoSubtitles: options.downloadAudioWhenNoSubtitles,
          incrementalUpdate: options.incrementalUpdate !== false,
          groupByDate: options.groupByDate,
          now: options.now,
          delayMs: options.delayMs,
          onProgress: options.onProgress,
          publishedAfter: options.publishedAfter,
          publishedBefore: options.publishedBefore,
        });
        item = { subscription, status: 'updated', result };
        break;
      } catch (error) {
        if (attempt >= retryCount) {
          item = {
            subscription,
            status: 'error',
            error: error.message || String(error),
          };
          break;
        }
        const retryDelayMs = delayMs + ((attempt + 1) * retryStepMs);
        onProgress({
          type: 'retry',
          subscription,
          attempt: attempt + 1,
          delayMs: retryDelayMs,
          message: `重试抓取: ${subscription.name || subscription.mid} (${retryDelayMs}ms)`,
        });
        await delay(retryDelayMs);
      }
    }
    results.push(item);
    onProgress({
      type: 'subscription',
      subscription,
      status: item.status,
      result: item.result,
      message: item.status === 'error'
        ? `抓取失败: ${subscription.name || subscription.mid} (${item.error || ''})`
        : `成功抓取: ${subscription.name || subscription.mid}`,
    });

    if (index < enabled.length - 1 && delayMs > 0) {
      await delay(delayMs);
    }
  }

  return {
    status: 'completed',
    startedAt: new Date().toISOString(),
    summary: {
      total: enabled.length,
      updated: results.filter((result) => result.status === 'updated').length,
      errors: results.filter((result) => result.status === 'error').length,
    },
    results,
  };
}

module.exports = {
  addSubscription,
  addSubscriptions,
  defaultSubscriptionsPath,
  listSubscriptions,
  parseSubscriptionInputs,
  removeSubscription,
  updateSubscriptions,
};
