const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  addSubscription,
  addSubscriptionGroup,
  addSubscriptions,
  listSubscriptionGroups,
  listSubscriptions,
  parseSubscriptionInputs,
  removeSubscription,
  removeSubscriptionGroup,
  retryDelayFor,
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
    group: '股评',
    subscriptionsPath,
    client,
  });
  const list = await listSubscriptions({ subscriptionsPath });

  assert.equal(added.mid, 1350959407);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, '三七床车流浪中国');
  assert.equal(list[0].group, '股评');
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

test('retries failed subscription adds and waits between inputs', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const subscriptionsPath = path.join(temp, 'subscriptions.json');
  const delays = [];
  const events = [];
  let calls = 0;
  const client = {
    getUploaderInfo: async (mid) => {
      calls += 1;
      if (calls === 1) throw new Error('uploader info failed: HTTP 412');
      return { mid: Number(mid), name: `up-${mid}` };
    },
    resolveUploaderByName: async () => ({ mid: 3, name: 'named-up' }),
  };

  const result = await addSubscriptions({
    input: '1\n2',
    subscriptionsPath,
    client,
    delayMs: 1000,
    retryStepMs: 300,
    retryCount: 1,
    delay: async (ms) => delays.push(ms),
    onProgress: (event) => events.push(event),
  });

  assert.equal(result.summary.added, 2);
  assert.deepEqual(delays, [5300, 1000]);
  assert.deepEqual(events.map((event) => event.type), ['retry', 'subscription-add', 'subscription-add']);
});

test('downloads grouped subscriptions under group folders', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const subscriptionsPath = path.join(temp, 'subscriptions.json');
  await fs.writeFile(subscriptionsPath, JSON.stringify([
    { mid: 1, name: 'one', input: '1', group: '股评', enabled: true },
  ]), 'utf8');
  const seen = [];

  await updateSubscriptions({
    subscriptionsPath,
    outputDir: temp,
    downloadUploaderSubtitles: async (options) => {
      seen.push(options);
      return { status: 'completed', uploader: { mid: 1, name: 'one' }, batch: { summary: { total: 0 } } };
    },
  });

  assert.equal(seen[0].outputDir, path.join(temp, '股评'));
});

test('lists saved groups and groups discovered from subscriptions', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const subscriptionsPath = path.join(temp, 'subscriptions.json');
  const groupsPath = path.join(temp, 'subscription-groups.json');
  await fs.writeFile(subscriptionsPath, JSON.stringify([
    { mid: 1, name: 'one', input: '1', group: '股评', enabled: true },
  ]), 'utf8');
  await fs.writeFile(groupsPath, JSON.stringify([{ name: '科技' }]), 'utf8');

  const groups = await listSubscriptionGroups({ subscriptionsPath, groupsPath });

  assert.equal(groups.length, 2);
  assert.equal(groups.includes('股评'), true);
  assert.equal(groups.includes('科技'), true);
});

test('adds subscription groups without duplicating names', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const groupsPath = path.join(temp, 'subscription-groups.json');
  const subscriptionsPath = path.join(temp, 'subscriptions.json');

  await addSubscriptionGroup({ group: '股评', groupsPath, subscriptionsPath });
  const result = await addSubscriptionGroup({ group: '股评', groupsPath, subscriptionsPath });

  assert.equal(result.name, '股评');
  assert.deepEqual(await listSubscriptionGroups({ groupsPath, subscriptionsPath }), ['股评']);
});

test('removes subscription groups and moves members to ungrouped', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const subscriptionsPath = path.join(temp, 'subscriptions.json');
  const groupsPath = path.join(temp, 'subscription-groups.json');
  await fs.writeFile(groupsPath, JSON.stringify([{ name: '股评' }]), 'utf8');
  await fs.writeFile(subscriptionsPath, JSON.stringify([
    { mid: 1, name: 'one', input: '1', group: '股评', enabled: true },
    { mid: 2, name: 'two', input: '2', group: '科技', enabled: true },
  ]), 'utf8');

  const result = await removeSubscriptionGroup({ group: '股评', groupsPath, subscriptionsPath });
  const subscriptions = await listSubscriptions({ subscriptionsPath });

  assert.equal(result.removed, '股评');
  assert.equal(result.updatedSubscriptions, 1);
  assert.equal(subscriptions.find((item) => item.mid === 1).group, '');
  assert.equal(subscriptions.find((item) => item.mid === 2).group, '科技');
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

test('updates only subscriptions in the selected group', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const subscriptionsPath = path.join(temp, 'subscriptions.json');
  await fs.writeFile(subscriptionsPath, JSON.stringify([
    { mid: 1, name: 'one', input: '1', group: '股评', enabled: true },
    { mid: 2, name: 'two', input: '2', group: '基金', enabled: true },
    { mid: 3, name: 'three', input: '3', group: '', enabled: true },
  ]), 'utf8');
  const seen = [];

  const result = await updateSubscriptions({
    subscriptionsPath,
    outputDir: temp,
    subscriptionGroup: '基金',
    downloadUploaderSubtitles: async (options) => {
      seen.push(options.uploader);
      return { status: 'completed', uploader: { mid: Number(options.uploader), name: options.uploader }, batch: { summary: { total: 0 } } };
    },
  });

  assert.equal(result.summary.total, 1);
  assert.deepEqual(seen, ['2']);
});

test('waits between enabled subscription updates', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const subscriptionsPath = path.join(temp, 'subscriptions.json');
  await fs.writeFile(subscriptionsPath, JSON.stringify([
    { mid: 1, name: 'one', input: '1', enabled: true },
    { mid: 2, name: 'two', input: '2', enabled: true },
  ]), 'utf8');
  const delays = [];

  await updateSubscriptions({
    subscriptionsPath,
    delayMs: 1200,
    delay: async (ms) => delays.push(ms),
    downloadUploaderSubtitles: async () => ({ status: 'completed', batch: { summary: { total: 0 } } }),
  });

  assert.deepEqual(delays, [1200]);
});

test('uses longer retry delays for HTTP 412 subscription failures', () => {
  assert.equal(retryDelayFor(new Error('uploader videos failed: HTTP 412'), 0, 800, 300), 5300);
  assert.equal(retryDelayFor(new Error('uploader videos failed: HTTP 412'), 1, 800, 300), 10600);
  assert.equal(retryDelayFor(new Error('temporary'), 0, 800, 300), 1100);
});
