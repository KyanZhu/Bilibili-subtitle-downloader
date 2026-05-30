const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { addSubscription, listSubscriptions, removeSubscription, updateSubscriptions } = require('../src/subscriptions');

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
