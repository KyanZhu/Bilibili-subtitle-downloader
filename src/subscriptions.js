const fs = require('node:fs/promises');
const path = require('node:path');
const { createBilibiliClient } = require('./bilibili-client');
const { downloadUploaderSubtitles } = require('./uploader');
const { resolveUploader } = require('./uploader');
const { sanitizeName } = require('./downloader');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHttp412(error) {
  return /HTTP 412/.test(error && (error.message || String(error)));
}

function retryDelayFor(error, attempt, delayMs, retryStepMs) {
  const standardDelay = delayMs + ((attempt + 1) * retryStepMs);
  if (!isHttp412(error)) {
    return standardDelay;
  }
  return Math.max(standardDelay, 5000 + (attempt * 5000) + ((attempt + 1) * retryStepMs));
}

function defaultSubscriptionsPath() {
  return path.join(process.cwd(), 'subscriptions.json');
}

function defaultGroupsPath() {
  return path.join(process.cwd(), 'subscription-groups.json');
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

async function writeGroups(filePath, groups) {
  await fs.writeFile(filePath, `${JSON.stringify(groups, null, 2)}\n`, 'utf8');
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

async function listSubscriptionGroups(options = {}) {
  const groupsPath = options.groupsPath || defaultGroupsPath();
  const subscriptionsPath = options.subscriptionsPath || defaultSubscriptionsPath();
  const storedGroups = await readJson(groupsPath);
  const subscriptions = await listSubscriptions({ subscriptionsPath });
  const names = new Set();

  if (Array.isArray(storedGroups)) {
    for (const group of storedGroups) {
      const name = sanitizeName(typeof group === 'string' ? group : group && group.name);
      if (name) names.add(name);
    }
  }
  for (const subscription of subscriptions) {
    const name = sanitizeName(subscription && subscription.group);
    if (name) names.add(name);
  }

  return Array.from(names).sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

async function addSubscriptionGroup(options = {}) {
  const groupsPath = options.groupsPath || defaultGroupsPath();
  const group = sanitizeName(options.group || options.name || '');
  if (!group) {
    throw new Error('Subscription group name is required.');
  }
  const groups = await listSubscriptionGroups({
    groupsPath,
    subscriptionsPath: options.subscriptionsPath,
  });
  if (!groups.includes(group)) {
    groups.push(group);
  }
  groups.sort((left, right) => left.localeCompare(right, 'zh-CN'));
  await writeGroups(groupsPath, groups.map((name) => ({ name })));
  return { name: group, groups };
}

async function removeSubscriptionGroup(options = {}) {
  const groupsPath = options.groupsPath || defaultGroupsPath();
  const subscriptionsPath = options.subscriptionsPath || defaultSubscriptionsPath();
  const group = sanitizeName(options.group || options.name || '');
  if (!group) {
    throw new Error('Subscription group name is required.');
  }

  const groups = (await listSubscriptionGroups({ groupsPath, subscriptionsPath }))
    .filter((name) => name !== group);
  const subscriptions = await listSubscriptions({ subscriptionsPath });
  let updatedSubscriptions = 0;
  const nextSubscriptions = subscriptions.map((subscription) => {
    if (sanitizeName(subscription.group || '') !== group) {
      return subscription;
    }
    updatedSubscriptions += 1;
    return { ...subscription, group: '' };
  });

  await writeGroups(groupsPath, groups.map((name) => ({ name })));
  await writeSubscriptions(subscriptionsPath, nextSubscriptions);
  return { removed: group, groups, updatedSubscriptions };
}

async function addSubscription(options) {
  const subscriptionsPath = options.subscriptionsPath || defaultSubscriptionsPath();
  const input = String(options.input || '').trim();
  const group = sanitizeName(options.group || '');
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
    group,
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
  const client = options.client || createBilibiliClient({ cookie: options.cookie });
  const delay = options.delay || wait;
  const delayMs = Number.isFinite(Number(options.delayMs)) ? Math.max(0, Number(options.delayMs)) : 800;
  const retryCount = Number.isFinite(Number(options.retryCount)) ? Math.max(0, Number(options.retryCount)) : 2;
  const retryStepMs = Number.isFinite(Number(options.retryStepMs)) ? Math.max(0, Number(options.retryStepMs)) : 300;
  const onProgress = options.onProgress || (() => {});
  const results = [];

  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    let result;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        const item = await addSubscription({
          ...options,
          input,
          client,
        });
        result = { input, status: 'added', item };
        break;
      } catch (error) {
        if (attempt >= retryCount) {
          result = {
            input,
            status: 'error',
            error: error.message || String(error),
          };
          break;
        }
        const retryDelayMs = retryDelayFor(error, attempt, delayMs, retryStepMs);
        onProgress({
          type: 'retry',
          input,
          attempt: attempt + 1,
          delayMs: retryDelayMs,
          message: `重试添加订阅: ${input} (${retryDelayMs}ms)`,
        });
        await delay(retryDelayMs);
      }
    }

    results.push(result);
    onProgress({
      type: 'subscription-add',
      input,
      status: result.status,
      result,
      message: result.status === 'error'
        ? `添加失败: ${input} (${result.error || ''})`
        : `添加成功: ${result.item.name || result.item.mid}`,
    });

    if (index < inputs.length - 1 && delayMs > 0) {
      await delay(delayMs);
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
  const groupFilter = options.subscriptionGroup === undefined ? undefined : sanitizeName(options.subscriptionGroup || '');
  const enabled = subscriptions.filter((subscription) => {
    if (subscription.enabled === false) return false;
    if (groupFilter === undefined) return true;
    return sanitizeName(subscription.group || '') === groupFilter;
  });
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
          outputDir: subscription.group
            ? path.join(options.outputDir || 'downloads', sanitizeName(subscription.group))
            : options.outputDir,
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
        const retryDelayMs = retryDelayFor(error, attempt, delayMs, retryStepMs);
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
  addSubscriptionGroup,
  defaultSubscriptionsPath,
  defaultGroupsPath,
  retryDelayFor,
  listSubscriptionGroups,
  listSubscriptions,
  parseSubscriptionInputs,
  removeSubscriptionGroup,
  removeSubscription,
  updateSubscriptions,
};
