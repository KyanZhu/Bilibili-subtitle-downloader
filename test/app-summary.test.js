const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElementStub() {
  return {
    className: '',
    classList: { toggle: () => {} },
    dataset: {},
    disabled: false,
    hidden: false,
    textContent: '',
    value: '',
    checked: false,
    addEventListener: () => {},
    appendChild: () => {},
    querySelector: () => createElementStub(),
  };
}

function loadAppContext() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const context = {
    document: {
      querySelector: () => createElementStub(),
      querySelectorAll: () => [],
      createElement: () => createElementStub(),
    },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

test('summarizes subscription update video totals from nested uploader results', () => {
  const { summarizePayload } = loadAppContext();
  const summary = summarizePayload({
    status: 'completed',
    summary: { total: 1, updated: 1, errors: 0 },
    results: [
      {
        subscription: { mid: 1350959407, name: '三七床车流浪中国' },
        status: 'updated',
        result: {
          batch: {
            summary: {
              total: 5,
              downloaded: 2,
              audioDownloaded: 1,
              skippedExisting: 1,
              errors: 0,
              noSubtitles: 1,
              authRequired: 0,
            },
          },
        },
      },
    ],
  });

  assert.match(summary, /订阅总数：1/);
  assert.match(summary, /总共抓取视频：5/);
  assert.match(summary, /成功下载：2/);
  assert.match(summary, /音频下载：1/);
  assert.match(summary, /跳过已有：1/);
  assert.match(summary, /没有字幕：1/);
});
