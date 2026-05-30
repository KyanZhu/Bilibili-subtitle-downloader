const test = require('node:test');
const assert = require('node:assert/strict');
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
