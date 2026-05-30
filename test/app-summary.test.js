const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList(element) {
  return {
    contains: (name) => element.classes.has(name),
    toggle: (name, enabled) => {
      if (enabled) {
        element.classes.add(name);
      } else {
        element.classes.delete(name);
      }
    },
  };
}

function createElementStub() {
  const element = {
    classes: new Set(),
    listeners: {},
    className: '',
    dataset: {},
    disabled: false,
    hidden: false,
    textContent: '',
    value: '',
    checked: false,
    lastChild: { textContent: '' },
    addEventListener: (eventName, handler) => {
      element.listeners[eventName] = handler;
    },
    appendChild: () => {},
    querySelector: () => createElementStub(),
  };
  element.classList = createClassList(element);
  return element;
}

function loadAppContext(setup = () => {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const elements = {
    '#download-form': createElementStub(),
    '#uploader-input': createElementStub(),
    '#video-input': createElementStub(),
    '#cookie-input': createElementStub(),
    '#output-input': createElementStub(),
    '#open-output-button': createElementStub(),
    '#start-date-input': createElementStub(),
    '#end-date-input': createElementStub(),
    '#chinese-only-input': createElementStub(),
    '#plain-text-input': createElementStub(),
    '#rename-by-title-input': createElementStub(),
    '#audio-fallback-input': createElementStub(),
    '#incremental-update-input': createElementStub(),
    '#group-by-date-input': createElementStub(),
    '#delay-input': createElementStub(),
    '#status': createElementStub(),
    '#result-kind': createElementStub(),
    '#summary-output': createElementStub(),
    '#result-output': createElementStub(),
    '#detail-toggle': createElementStub(),
    '#download-button': createElementStub(),
    '#shutdown-button': createElementStub(),
    '#clear-button': createElementStub(),
    '#subscription-input': createElementStub(),
    '#add-subscription-button': createElementStub(),
    '#subscription-list': createElementStub(),
  };
  elements['#delay-input'].value = '800';
  const tabButtons = ['video', 'uploader', 'subscriptions'].map((tabName) => {
    const button = createElementStub();
    button.dataset.tab = tabName;
    if (tabName === 'video') button.classes.add('is-active');
    return button;
  });
  const tabPanels = ['video', 'uploader', 'subscriptions'].map((tabName) => {
    const panel = createElementStub();
    panel.dataset.panel = tabName;
    return panel;
  });
  const fetchCalls = [];
  const context = {
    document: {
      querySelector: (selector) => elements[selector] || createElementStub(),
      querySelectorAll: (selector) => {
        if (selector === '.tab-button') return tabButtons;
        if (selector === '.tab-panel') return tabPanels;
        return [];
      },
      createElement: () => createElementStub(),
    },
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url, options });
      return { ok: true, json: async () => ({ status: 'completed', results: [], summary: { total: 0 } }) };
    },
  };
  setup(elements, tabButtons, tabPanels, fetchCalls);
  vm.createContext(context);
  vm.runInContext(source, context);
  context.__elements = elements;
  context.__tabButtons = tabButtons;
  context.__fetchCalls = fetchCalls;
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

test('submits uploader tab to download api instead of subscription update api', async () => {
  const context = loadAppContext((elements) => {
    elements['#uploader-input'].value = '1350959407';
    elements['#output-input'].value = 'downloads';
  });

  context.setActiveTab('uploader');
  await context.__elements['#download-form'].listeners.submit({ preventDefault: () => {} });

  assert.equal(context.__fetchCalls[0].url, '/api/download');
  const body = JSON.parse(context.__fetchCalls[0].options.body);
  assert.equal(body.uploaderMode, true);
  assert.equal(body.uploader, '1350959407');
});

test('submits subscriptions tab to subscription update api', async () => {
  const context = loadAppContext((elements) => {
    elements['#output-input'].value = 'downloads';
  });

  context.setActiveTab('subscriptions');
  await context.__elements['#download-form'].listeners.submit({ preventDefault: () => {} });

  assert.equal(context.__fetchCalls[0].url, '/api/subscriptions');
  assert.equal(context.__fetchCalls[1].url, '/api/subscriptions/update');
});
