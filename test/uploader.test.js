const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseUploaderInput, downloadUploaderSubtitles } = require('../src/uploader');

test('parses numeric mid and space urls', () => {
  assert.deepEqual(parseUploaderInput('1350959407'), { type: 'mid', value: '1350959407' });
  assert.deepEqual(parseUploaderInput('https://space.bilibili.com/1350959407'), { type: 'mid', value: '1350959407' });
});

test('treats non-numeric input as uploader name', () => {
  assert.deepEqual(parseUploaderInput('三七床车流浪中国'), { type: 'name', value: '三七床车流浪中国' });
});

test('downloads uploader videos into uploader-name folder', async () => {
  const seen = [];
  const result = await downloadUploaderSubtitles({
    uploader: '三七床车流浪中国',
    outputDir: 'downloads',
    delayMs: 0,
    client: {
      resolveUploaderByName: async () => ({ mid: 1350959407, name: '三七床车流浪中国' }),
      getUploaderInfo: async () => ({ mid: 1350959407, name: '三七床车流浪中国' }),
      getUploaderVideos: async () => ({
        total: 2,
        videos: [
          { bvid: 'BV1111111111', title: 'One' },
          { bvid: 'BV2222222222', title: 'Two' },
        ],
      }),
    },
    downloadBatchSubtitles: async (options) => {
      seen.push(options);
      return { status: 'completed', summary: { total: 2 }, results: [] };
    },
  });

  assert.equal(result.uploader.name, '三七床车流浪中国');
  assert.deepEqual(seen[0].inputs, ['BV1111111111', 'BV2222222222']);
  assert.equal(seen[0].outputDir, path.join('downloads', '三七床车流浪中国'));
});

test('uses smaller uploader list pages and a conservative page delay', async () => {
  const seen = {};
  await downloadUploaderSubtitles({
    uploader: '1350959407',
    outputDir: 'downloads',
    delayMs: 5000,
    client: {
      resolveUploaderByName: async () => ({ mid: 1350959407, name: 'up' }),
      getUploaderInfo: async () => ({ mid: 1350959407, name: 'up' }),
      getUploaderVideos: async (mid, options) => {
        seen.mid = mid;
        seen.options = options;
        return { total: 0, videos: [] };
      },
    },
    downloadBatchSubtitles: async () => ({ status: 'completed', summary: { total: 0 }, results: [] }),
  });

  assert.equal(seen.options.pageSize, 20);
  assert.equal(seen.options.pageDelayMs, 3000);
});

test('filters uploader videos by publish time before downloading', async () => {
  const seen = [];
  const result = await downloadUploaderSubtitles({
    uploader: '1350959407',
    outputDir: 'downloads',
    delayMs: 0,
    publishedAfter: 1778198400,
    publishedBefore: 1778284799,
    client: {
      resolveUploaderByName: async () => ({ mid: 1350959407, name: '三七床车流浪中国' }),
      getUploaderInfo: async () => ({ mid: 1350959407, name: '三七床车流浪中国' }),
      getUploaderVideos: async () => ({
        total: 3,
        videos: [
          { bvid: 'BV_OLD', title: 'Old', created: 1778111999 },
          { bvid: 'BV_IN_RANGE', title: 'In range', created: 1778214713 },
          { bvid: 'BV_NEW', title: 'New', created: 1778371200 },
        ],
      }),
    },
    downloadBatchSubtitles: async (options) => {
      seen.push(options);
      return { status: 'completed', summary: { total: options.inputs.length }, results: [] };
    },
  });

  assert.deepEqual(seen[0].inputs, ['BV_IN_RANGE']);
  assert.equal(result.totalVideos, 3);
  assert.equal(result.filteredVideos, 1);
});

test('skips existing uploader video folders when incremental update is enabled', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  await fs.mkdir(path.join(temp, '三七床车流浪中国', 'BV_EXISTING'), { recursive: true });
  const seen = [];
  const result = await downloadUploaderSubtitles({
    uploader: '1350959407',
    outputDir: temp,
    delayMs: 0,
    incrementalUpdate: true,
    client: {
      resolveUploaderByName: async () => ({ mid: 1350959407, name: '三七床车流浪中国' }),
      getUploaderInfo: async () => ({ mid: 1350959407, name: '三七床车流浪中国' }),
      getUploaderVideos: async () => ({
        total: 2,
        videos: [
          { bvid: 'BV_EXISTING', title: 'Existing', created: 1778214713 },
          { bvid: 'BV_NEW', title: 'New', created: 1778214714 },
        ],
      }),
    },
    downloadBatchSubtitles: async (options) => {
      seen.push(options);
      return { status: 'completed', summary: { total: options.inputs.length }, results: [] };
    },
  });

  assert.deepEqual(seen[0].inputs, ['BV_NEW']);
  assert.equal(result.skippedExisting, 1);
  assert.equal(result.batch.summary.skippedExisting, 1);
});

test('skips existing date-named uploader folders when incremental update is enabled', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  await fs.mkdir(path.join(temp, '三七床车流浪中国', '2026-05-08_Existing'), { recursive: true });
  const seen = [];
  const result = await downloadUploaderSubtitles({
    uploader: '1350959407',
    outputDir: temp,
    delayMs: 0,
    groupByDate: true,
    incrementalUpdate: true,
    client: {
      resolveUploaderByName: async () => ({ mid: 1350959407, name: '三七床车流浪中国' }),
      getUploaderInfo: async () => ({ mid: 1350959407, name: '三七床车流浪中国' }),
      getUploaderVideos: async () => ({
        total: 2,
        videos: [
          { bvid: 'BV_EXISTING', title: 'Existing', created: 1778214713 },
          { bvid: 'BV_NEW', title: 'New', created: 1778214714 },
        ],
      }),
    },
    downloadBatchSubtitles: async (options) => {
      seen.push(options);
      return { status: 'completed', summary: { total: options.inputs.length }, results: [] };
    },
  });

  assert.deepEqual(seen[0].inputs, [{ input: 'BV_NEW', videoFolderName: '2026-05-08_New' }]);
  assert.equal(result.skippedExisting, 1);
});

test('keeps uploader folder outside date grouping when requested', async () => {
  const seen = [];
  const result = await downloadUploaderSubtitles({
    uploader: '1350959407',
    outputDir: 'downloads',
    delayMs: 0,
    groupByDate: true,
    now: new Date('2026-05-30T12:34:56Z'),
    client: {
      resolveUploaderByName: async () => ({ mid: 1350959407, name: '三七床车流浪中国' }),
      getUploaderInfo: async () => ({ mid: 1350959407, name: '三七床车流浪中国' }),
      getUploaderVideos: async () => ({
        total: 1,
        videos: [{ bvid: 'BV_NEW', title: 'New Video', created: 1778214714 }],
      }),
    },
    downloadBatchSubtitles: async (options) => {
      seen.push(options);
      return { status: 'completed', summary: { total: options.inputs.length }, results: [] };
    },
  });

  assert.equal(seen[0].outputDir, path.join('downloads', '三七床车流浪中国'));
  assert.deepEqual(seen[0].inputs, [{ input: 'BV_NEW', videoFolderName: '2026-05-08_New_Video' }]);
  assert.equal(result.outputDir, path.join('downloads', '三七床车流浪中国'));
});
