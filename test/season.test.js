const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { downloadSeasonSubtitles, getSeasonVideos, parseSeasonInput } = require('../src/season');

test('parses bilibili season urls', () => {
  assert.deepEqual(parseSeasonInput('https://space.bilibili.com/701260681/lists/7763764?type=season'), {
    mid: '701260681',
    seasonId: '7763764',
    url: 'https://space.bilibili.com/701260681/lists/7763764?type=season',
  });
});

test('fetches season videos across pages', async () => {
  const calls = [];
  const client = {
    getSeasonArchives: async (mid, seasonId, options) => {
      calls.push({ mid, seasonId, options });
      if (options.pageNum === 1) {
        return {
          meta: { title: '合集标题', total: 3 },
          page: { total: 3 },
          archives: [
            { bvid: 'BV1', aid: 1, title: 'one', pubdate: 100 },
            { bvid: 'BV2', aid: 2, title: 'two', pubdate: 200 },
          ],
        };
      }
      return {
        page: { total: 3 },
        archives: [{ bvid: 'BV3', aid: 3, title: 'three', pubdate: 300 }],
      };
    },
  };

  const result = await getSeasonVideos(client, parseSeasonInput('701260681 7763764'), {
    pageSize: 2,
    maxPages: 2,
  });

  assert.equal(result.meta.title, '合集标题');
  assert.deepEqual(result.videos.map((video) => video.bvid), ['BV1', 'BV2', 'BV3']);
  assert.equal(calls.length, 2);
});

test('downloads season subtitles with batch downloader', async () => {
  let received;
  const result = await downloadSeasonSubtitles({
    input: 'https://space.bilibili.com/701260681/lists/7763764?type=season',
    outputDir: 'downloads',
    delayMs: 1200,
    client: {
      getSeasonArchives: async () => ({
        meta: { title: '合集 标题', total: 2 },
        page: { total: 2 },
        archives: [
          { bvid: 'BV1', aid: 1, title: 'one', pubdate: 100 },
          { bvid: 'BV2', aid: 2, title: 'two', pubdate: 200 },
        ],
      }),
    },
    downloadBatchSubtitles: async (options) => {
      received = options;
      return { status: 'completed', summary: { total: options.inputs.length }, results: [] };
    },
  });

  assert.deepEqual(received.inputs, ['BV1', 'BV2']);
  assert.equal(received.outputDir, path.join('downloads', '合集 标题'));
  assert.equal(received.useDateFolder, false);
  assert.equal(received.delayMs, 1200);
  assert.equal(result.season.title, '合集 标题');
});
