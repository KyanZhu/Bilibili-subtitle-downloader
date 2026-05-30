const fs = require('node:fs/promises');
const path = require('node:path');
const { createBilibiliClient } = require('./bilibili-client');
const { downloadUploaderSubtitles } = require('./uploader');
const { resolveUploader } = require('./uploader');

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
  const results = [];

  for (const subscription of enabled) {
    try {
      const result = await runDownload({
        uploader: String(subscription.mid || subscription.input),
        outputDir: options.outputDir,
        cookie: options.cookie,
        chineseOnly: options.chineseOnly,
        plainText: options.plainText,
        renameByTitle: options.renameByTitle,
        downloadAudioWhenNoSubtitles: options.downloadAudioWhenNoSubtitles,
        incrementalUpdate: options.incrementalUpdate !== false,
        groupByDate: options.groupByDate,
        now: options.now,
        delayMs: options.delayMs,
        publishedAfter: options.publishedAfter,
        publishedBefore: options.publishedBefore,
      });
      results.push({ subscription, status: 'updated', result });
    } catch (error) {
      results.push({
        subscription,
        status: 'error',
        error: error.message || String(error),
      });
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
  defaultSubscriptionsPath,
  listSubscriptions,
  removeSubscription,
  updateSubscriptions,
};
