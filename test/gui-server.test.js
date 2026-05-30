const test = require('node:test');
const assert = require('node:assert/strict');
const { createGuiServer } = require('../src/gui-server');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address().port);
    });
  });
}

test('download api parses cookie text and returns downloader result', async () => {
  let received;
  const server = createGuiServer({
    downloadVideoSubtitles: async (options) => {
      received = options;
      return { bvid: 'BV1Jh5d68Er3', status: 'downloaded', downloaded: [{ language: 'zh-Hans' }] };
    },
  });
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: 'https://www.bilibili.com/video/BV1Jh5d68Er3',
        cookieText: '.bilibili.com\tTRUE\t/\tTRUE\t1785224583\tSESSDATA\tabc',
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'downloaded');
    assert.equal(received.input, 'https://www.bilibili.com/video/BV1Jh5d68Er3');
    assert.equal(received.cookie, 'SESSDATA=abc');
  } finally {
    server.close();
  }
});

test('download api forwards batch options to batch downloader', async () => {
  let received;
  const server = createGuiServer({
    downloadBatchSubtitles: async (options) => {
      received = options;
      return { status: 'completed', results: [], summary: { total: 2 } };
    },
  });
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: 'BV1111111111\nBV2222222222',
        cookieText: '.bilibili.com\tTRUE\t/\tTRUE\t1785224583\tSESSDATA\tabc',
        chineseOnly: true,
        plainText: true,
        renameByTitle: true,
        downloadAudioWhenNoSubtitles: true,
        delayMs: 300,
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'completed');
    assert.deepEqual(received.inputs, ['BV1111111111', 'BV2222222222']);
    assert.equal(received.cookie, 'SESSDATA=abc');
    assert.equal(received.chineseOnly, true);
    assert.equal(received.plainText, true);
    assert.equal(received.renameByTitle, true);
    assert.equal(received.downloadAudioWhenNoSubtitles, true);
    assert.equal(received.delayMs, 300);
  } finally {
    server.close();
  }
});

test('download api forwards uploader mode to uploader downloader', async () => {
  let received;
  const server = createGuiServer({
    downloadUploaderSubtitles: async (options) => {
      received = options;
      return { status: 'completed', uploader: { mid: 1350959407, name: '三七床车流浪中国' } };
    },
  });
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploaderMode: true,
        uploader: 'https://space.bilibili.com/1350959407',
        cookieText: '.bilibili.com\tTRUE\t/\tTRUE\t1785224583\tSESSDATA\tabc',
        outputDir: 'downloads',
        chineseOnly: true,
        plainText: true,
        renameByTitle: true,
        delayMs: 1200,
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.uploader.mid, 1350959407);
    assert.equal(received.uploader, 'https://space.bilibili.com/1350959407');
    assert.equal(received.cookie, 'SESSDATA=abc');
    assert.equal(received.outputDir, 'downloads');
    assert.equal(received.chineseOnly, true);
    assert.equal(received.plainText, true);
    assert.equal(received.renameByTitle, true);
    assert.equal(received.delayMs, 1200);
    assert.equal(received.publishedAfter, undefined);
    assert.equal(received.publishedBefore, undefined);
  } finally {
    server.close();
  }
});

test('download api forwards uploader date filters as inclusive timestamps', async () => {
  let received;
  const server = createGuiServer({
    downloadUploaderSubtitles: async (options) => {
      received = options;
      return { status: 'completed', uploader: { mid: 1350959407, name: '三七床车流浪中国' } };
    },
  });
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploaderMode: true,
        uploader: '1350959407',
        startDate: '2026-05-08',
        endDate: '2026-05-09',
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(received.publishedAfter, 1778198400);
    assert.equal(received.publishedBefore, 1778371199);
  } finally {
    server.close();
  }
});

test('download api rejects missing video input', async () => {
  const server = createGuiServer({
    downloadVideoSubtitles: async () => {
      throw new Error('should not be called');
    },
  });
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: '' }),
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /Video URL or BV id is required/);
  } finally {
    server.close();
  }
});
