const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  addSubscription,
  addSubscriptions,
  listSubscriptions,
  parseSubscriptionInputs,
  removeSubscription,
  updateSubscriptions,
} = require('../src/subscriptions');

test('parses subscription inputs from commas and new lines', () => {
  assert.deepEqual(parseSubscriptionInputs('1350959407, 三七床车流浪中国\nhttps://space.bilibili.com/1350959407'), [
    '1350959407',
    '三七床车流浪中国',
    'https://space.bilibili.com/1350959407',
  ]);
});

test('adds resolved uploader subscriptions and persists them', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const subscriptionsPath = path.join(temp, 'subscriptions.json');
  const client = {
    getUploaderInfo: async () => ({ mid: 1350959407, name: '三七床车流浪中国' }),
    resolveUploaderByName: async () => ({ mid: 1350959407, name: '三七床车流浪中国' }),
  };

  const added = await addSubscription({
    input: '1350959407',
    subscriptionsPath,
    client,
  });
  const list = await listSubscriptions({ subscriptionsPath });

  assert.equal(added.mid, 1350959407);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, '三七床车流浪中国');
});

test('adds subscriptions in a batch and continues after errors', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const subscriptionsPath = path.join(temp, 'subscriptions.json');
  const client = {
    getUploaderInfo: async (mid) => {
      if (mid === '2') throw new Error('not found');
      return { mid: Number(mid), name: `up-${mid}` };
    },
    resolveUploaderByName: async () => ({ mid: 3, name: 'named-up' }),
  };

  const result = await addSubscriptions({
    input: '1, 2\nnamed',
    subscriptionsPath,
    client,
  });
  const list = await listSubscriptions({ subscriptionsPath });

  assert.equal(result.summary.total, 3);
  assert.equal(result.summary.added, 2);
  assert.equal(result.summary.errors, 1);
  assert.deepEqual(list.map((item) => item.mid), [1, 3]);
});

test('removes subscriptions by mid', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const subscriptionsPath = path.join(temp, 'subscriptions.json');
  await fs.writeFile(subscriptionsPath, JSON.stringify([
    { mid: 1, name: 'one', input: '1', enabled: true },
    { mid: 2, name: 'two', input: '2', enabled: true },
  ]), 'utf8');

  await removeSubscription({ mid: 1, subscriptionsPath });
  const list = await listSubscriptions({ subscriptionsPath });

  assert.deepEqual(list.map((item) => item.mid), [2]);
});

test('updates enabled subscriptions with incremental uploader downloads', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const subscriptionsPath = path.join(temp, 'subscriptions.json');
  await fs.writeFile(subscriptionsPath, JSON.stringify([
    { mid: 1, name: 'one', input: '1', enabled: true },
    { mid: 2, name: 'two', input: '2', enabled: false },
  ]), 'utf8');
  const seen = [];

  const result = await updateSubscriptions({
    subscriptionsPath,
    outputDir: temp,
    groupByDate: true,
    downloadUploaderSubtitles: async (options) => {
      seen.push(options);
      return { status: 'completed', uploader: { mid: 1, name: 'one' }, batch: { summary: { total: 0 } } };
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.updated, 1);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].uploader, '1');
  assert.equal(seen[0].incrementalUpdate, true);
  assert.equal(seen[0].groupByDate, true);
});
