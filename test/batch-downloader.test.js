const test = require('node:test');
const assert = require('node:assert/strict');
const { downloadBatchSubtitles, parseBatchInputs, summarize } = require('../src/batch-downloader');

test('parses batch inputs from lines and removes duplicates', () => {
  assert.deepEqual(parseBatchInputs('BV1111111111\n\nBV2222222222\nBV1111111111'), [
    'BV1111111111',
    'BV2222222222',
  ]);
});

test('downloads videos sequentially with a delay between items', async () => {
  const calls = [];
  const delays = [];

  const result = await downloadBatchSubtitles({
    inputs: ['BV1111111111', 'BV2222222222'],
    delayMs: 250,
    renameByTitle: true,
    delay: async (ms) => delays.push(ms),
    downloadVideoSubtitles: async (options) => {
      assert.equal(options.renameByTitle, true);
      calls.push(options.input);
      return { bvid: options.input, status: 'downloaded', downloaded: [] };
    },
  });

  assert.deepEqual(calls, ['BV1111111111', 'BV2222222222']);
  assert.deepEqual(delays, [250]);
  assert.equal(result.status, 'completed');
  assert.equal(result.summary.downloaded, 2);
});

test('keeps batch running when one item fails', async () => {
  const result = await downloadBatchSubtitles({
    inputs: ['BV1111111111', 'bad-input'],
    delayMs: 0,
    delay: async () => {},
    downloadVideoSubtitles: async (options) => {
      if (options.input === 'bad-input') throw new Error('broken');
      return { bvid: options.input, status: 'no-subtitles', downloaded: [] };
    },
  });

  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].status, 'no-subtitles');
  assert.equal(result.results[1].status, 'error');
  assert.equal(result.summary.errors, 1);
  assert.deepEqual(result.summary.failedVideos, [
    {
      input: 'bad-input',
      url: 'bad-input',
      error: 'broken',
    },
  ]);
});

test('passes per-video folder names to downloader', async () => {
  const calls = [];

  await downloadBatchSubtitles({
    inputs: [{ input: 'BV1111111111', videoFolderName: '2026-05-08_Title' }],
    outputDir: 'downloads',
    delayMs: 0,
    downloadVideoSubtitles: async (options) => {
      calls.push(options);
      return { bvid: options.input, status: 'downloaded', downloaded: [] };
    },
  });

  assert.equal(calls[0].input, 'BV1111111111');
  assert.equal(calls[0].outputDir, 'downloads');
  assert.equal(calls[0].videoFolderName, '2026-05-08_Title');
});

test('summarizes audio fallback downloads', () => {
  const summary = summarize([
    { input: 'BV_AUDIO', status: 'audio-downloaded' },
    { input: 'BV_NO_SUBS', status: 'no-subtitles' },
  ]);

  assert.equal(summary.audioDownloaded, 1);
  assert.equal(summary.noSubtitles, 1);
});
