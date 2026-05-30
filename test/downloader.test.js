const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { downloadVideoSubtitles } = require('../src/downloader');

test('writes json and ass files for available subtitles', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const client = {
    getPages: async () => [{ cid: 123, page: 1, part: 'Part One' }],
    getPlayerInfo: async () => ({
      subtitle: {
        subtitles: [{ lan: 'zh-Hans', subtitle_url: '//example.com/sub.json' }],
      },
    }),
    downloadSubtitle: async () => ({ body: [{ from: 0, to: 1, content: 'hello' }] }),
  };

  const result = await downloadVideoSubtitles({ input: 'BV1Jh5d68Er3', outputDir: temp, client });
  assert.equal(result.status, 'downloaded');
  assert.equal(result.downloaded.length, 1);

  const jsonPath = path.join(temp, 'BV1Jh5d68Er3', 'subtitles', 'p01-zh-Hans.json');
  const assPath = path.join(temp, 'BV1Jh5d68Er3', 'subtitles', 'p01-zh-Hans.ass');
  assert.match(await fs.readFile(jsonPath, 'utf8'), /hello/);
  assert.match(await fs.readFile(assPath, 'utf8'), /Dialogue:/);
});

test('filters to chinese subtitle tracks when requested', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const downloadedUrls = [];
  const client = {
    getPages: async () => [{ cid: 123, page: 1, part: 'Part One' }],
    getPlayerInfo: async () => ({
      subtitle: {
        subtitles: [
          { lan: 'en-US', subtitle_url: '//example.com/en.json' },
          { lan: 'zh-Hans', subtitle_url: '//example.com/zh.json' },
        ],
      },
    }),
    downloadSubtitle: async (url) => {
      downloadedUrls.push(url);
      return { body: [{ from: 0, to: 1, content: '你好' }] };
    },
  };

  const result = await downloadVideoSubtitles({
    input: 'BV1Jh5d68Er3',
    outputDir: temp,
    client,
    chineseOnly: true,
  });

  assert.equal(result.downloaded.length, 1);
  assert.deepEqual(downloadedUrls, ['//example.com/zh.json']);
  assert.equal(result.pages[0].subtitleCount, 1);
});

test('writes plain text files when requested', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const client = {
    getPages: async () => [{ cid: 123, page: 1, part: 'Part One' }],
    getPlayerInfo: async () => ({
      subtitle: {
        subtitles: [{ lan: 'zh-Hans', subtitle_url: '//example.com/zh.json' }],
      },
    }),
    downloadSubtitle: async () => ({
      body: [
        { from: 0, to: 1, content: '第一句' },
        { from: 1, to: 2, content: '第二句' },
      ],
    }),
  };

  const result = await downloadVideoSubtitles({
    input: 'BV1Jh5d68Er3',
    outputDir: temp,
    client,
    plainText: true,
  });

  const txtPath = result.downloaded[0].txtPath;
  assert.equal(await fs.readFile(txtPath, 'utf8'), '第一句\n第二句\n');
});

test('records no-subtitle videos without throwing', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const client = {
    getPages: async () => [{ cid: 456, page: 1, part: 'Only Part' }],
    getPlayerInfo: async () => ({ subtitle: { subtitles: [] } }),
  };

  const result = await downloadVideoSubtitles({ input: 'BV1vBdMBREtm', outputDir: temp, client });
  assert.equal(result.status, 'no-subtitles');
  const metadata = JSON.parse(await fs.readFile(path.join(temp, 'BV1vBdMBREtm', 'metadata.json'), 'utf8'));
  assert.equal(metadata.status, 'no-subtitles');
});

test('downloads highest bandwidth audio when no subtitles and fallback is enabled', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const downloaded = [];
  const client = {
    getPages: async () => [{ cid: 456, page: 1, part: 'Only Part' }],
    getPlayerInfo: async () => ({ subtitle: { subtitles: [] } }),
    getPlayUrl: async () => ({
      dash: {
        audio: [
          { baseUrl: 'https://example.com/low.m4s', bandwidth: 64000, mimeType: 'audio/mp4' },
          { baseUrl: 'https://example.com/high.m4s', bandwidth: 128000, mimeType: 'audio/mp4' },
        ],
      },
    }),
    downloadBinary: async (url) => {
      downloaded.push(url);
      return Buffer.from('fake audio');
    },
  };

  const result = await downloadVideoSubtitles({
    input: 'BV1vBdMBREtm',
    outputDir: temp,
    client,
    downloadAudioWhenNoSubtitles: true,
  });

  assert.equal(result.status, 'audio-downloaded');
  assert.deepEqual(downloaded, ['https://example.com/high.m4s']);
  assert.equal(result.audio.length, 1);
  assert.equal(await fs.readFile(result.audio[0].path, 'utf8'), 'fake audio');
});

test('records auth-required when subtitles require login or purchase', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const client = {
    getPages: async () => [{ cid: 789, page: 1, part: 'Paid Part' }],
    getPlayerInfo: async () => ({
      need_login_subtitle: true,
      subtitle: { subtitles: [] },
    }),
  };

  const result = await downloadVideoSubtitles({ input: 'BV1Jh5d68Er3', outputDir: temp, client });
  assert.equal(result.status, 'auth-required');
  assert.equal(result.needsAuthenticatedSubtitleAccess, true);
});

test('uses video title in subtitle filenames when requested', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-sub-'));
  const client = {
    getVideoInfo: async () => ({ title: 'A/B: Video Title?' }),
    getPages: async () => [{ cid: 123, page: 1, part: 'Part One' }],
    getPlayerInfo: async () => ({
      subtitle: {
        subtitles: [{ lan: 'zh-Hans', subtitle_url: '//example.com/zh.json' }],
      },
    }),
    downloadSubtitle: async () => ({ body: [{ from: 0, to: 1, content: 'hello' }] }),
  };

  const result = await downloadVideoSubtitles({
    input: 'BV1Jh5d68Er3',
    outputDir: temp,
    client,
    renameByTitle: true,
  });

  assert.match(path.basename(result.downloaded[0].assPath), /^A_B__Video_Title_-p01-zh-Hans\.ass$/);
  assert.equal(result.title, 'A/B: Video Title?');
});
