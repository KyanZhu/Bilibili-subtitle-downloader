const form = document.querySelector('#download-form');
const tabButtons = Array.from(document.querySelectorAll('.tab-button'));
const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
const uploaderInput = document.querySelector('#uploader-input');
const videoInput = document.querySelector('#video-input');
const cookieInput = document.querySelector('#cookie-input');
const outputInput = document.querySelector('#output-input');
const openOutputButton = document.querySelector('#open-output-button');
const startDateInput = document.querySelector('#start-date-input');
const endDateInput = document.querySelector('#end-date-input');
const chineseOnlyInput = document.querySelector('#chinese-only-input');
const plainTextInput = document.querySelector('#plain-text-input');
const renameByTitleInput = document.querySelector('#rename-by-title-input');
const audioFallbackInput = document.querySelector('#audio-fallback-input');
const incrementalUpdateInput = document.querySelector('#incremental-update-input');
const delayInput = document.querySelector('#delay-input');
const statusEl = document.querySelector('#status');
const resultKind = document.querySelector('#result-kind');
const summaryOutput = document.querySelector('#summary-output');
const resultOutput = document.querySelector('#result-output');
const detailToggle = document.querySelector('#detail-toggle');
const downloadButton = document.querySelector('#download-button');
const clearButton = document.querySelector('#clear-button');
const subscriptionInput = document.querySelector('#subscription-input');
const addSubscriptionButton = document.querySelector('#add-subscription-button');
const subscriptionList = document.querySelector('#subscription-list');

let lastPayload = null;
let detailsVisible = false;
let activeTab = 'video';

function setStatus(label, className) {
  statusEl.className = `status ${className || ''}`.trim();
  statusEl.textContent = label;
}

function videoUrl(value) {
  if (!value) return '';
  if (String(value).startsWith('BV')) return `https://www.bilibili.com/video/${value}`;
  return String(value);
}

function getBatchPayload(payload) {
  return payload && payload.batch ? payload.batch : payload;
}

function commonPayload() {
  return {
    cookieText: cookieInput.value,
    outputDir: outputInput.value,
    chineseOnly: chineseOnlyInput.checked,
    plainText: plainTextInput.checked,
    renameByTitle: renameByTitleInput.checked,
    downloadAudioWhenNoSubtitles: audioFallbackInput.checked,
    incrementalUpdate: incrementalUpdateInput.checked,
    delayMs: Number(delayInput.value || 800),
    startDate: startDateInput.value,
    endDate: endDateInput.value,
  };
}

function summarizePayload(payload) {
  if (!payload) return '还没有运行下载任务。';
  const batch = getBatchPayload(payload);

  if (batch && batch.summary) {
    const summary = batch.summary;
    const lines = [];
    if (payload.uploader) {
      lines.push(`UP 主：${payload.uploader.name || payload.uploader.mid}`);
    }
    lines.push(`总共抓取视频：${payload.totalVideos || summary.total || 0}`);
    if (payload.filteredVideos !== undefined) {
      lines.push(`符合时间范围：${payload.filteredVideos}`);
    }
    lines.push(`成功下载：${summary.downloaded || 0}`);
    lines.push(`音频下载：${summary.audioDownloaded || 0}`);
    lines.push(`跳过已有：${summary.skippedExisting || 0}`);
    lines.push(`下载失败：${summary.errors || 0}`);
    lines.push(`没有字幕：${summary.noSubtitles || 0}`);
    lines.push(`需要权限：${summary.authRequired || 0}`);
    if (payload.outputDir) lines.push(`保存目录：${payload.outputDir}`);

    const failedVideos = summary.failedVideos || [];
    if (failedVideos.length > 0) {
      lines.push('');
      lines.push('失败视频：');
      for (const item of failedVideos) {
        lines.push(`- ${videoUrl(item.url || item.input)}${item.error ? ` (${item.error})` : ''}`);
      }
    }
    return lines.join('\n');
  }

  if (payload.summary && payload.results) {
    const lines = [];
    lines.push(`订阅总数：${payload.summary.total || 0}`);
    lines.push(`更新成功：${payload.summary.updated || 0}`);
    lines.push(`更新失败：${payload.summary.errors || 0}`);
    const failed = payload.results.filter((item) => item.status === 'error');
    if (failed.length > 0) {
      lines.push('');
      lines.push('失败订阅：');
      for (const item of failed) {
        lines.push(`- ${item.subscription.name || item.subscription.mid}: ${item.error}`);
      }
    }
    return lines.join('\n');
  }

  const lines = [];
  lines.push(`视频：${payload.bvid ? videoUrl(payload.bvid) : payload.input || ''}`);
  lines.push(`状态：${payload.status || 'unknown'}`);
  lines.push(`成功下载：${payload.status === 'downloaded' ? payload.downloaded.length : 0}`);
  lines.push(`音频下载：${payload.status === 'audio-downloaded' ? payload.audio.length : 0}`);
  lines.push(`没有字幕：${payload.status === 'no-subtitles' ? 1 : 0}`);
  lines.push(`需要权限：${payload.status === 'auth-required' ? 1 : 0}`);
  if (payload.downloaded && payload.downloaded.length > 0) {
    lines.push('');
    lines.push('文件：');
    for (const item of payload.downloaded) {
      lines.push(`- ${item.assPath}`);
      if (item.txtPath) lines.push(`- ${item.txtPath}`);
    }
  }
  if (payload.audio && payload.audio.length > 0) {
    lines.push('');
    lines.push('音频：');
    for (const item of payload.audio) {
      lines.push(`- ${item.path}`);
    }
  }
  return lines.join('\n');
}

function updateDetailVisibility() {
  resultOutput.hidden = !detailsVisible;
  detailToggle.textContent = detailsVisible ? '隐藏详情' : '显示详情';
}

function showResult(kind, payload, options = {}) {
  lastPayload = payload;
  detailsVisible = Boolean(options.showDetails);
  resultKind.textContent = kind;
  summaryOutput.textContent = typeof payload === 'string' ? payload : summarizePayload(payload);
  resultOutput.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  detailToggle.disabled = typeof payload === 'string' || !payload;
  updateDetailVisibility();
}

function setActiveTab(tabName) {
  activeTab = tabName;
  form.classList.toggle('is-video-mode', tabName === 'video');
  for (const button of tabButtons) {
    button.classList.toggle('is-active', button.dataset.tab === tabName);
  }
  for (const panel of tabPanels) {
    const isActive = panel.dataset.panel === tabName;
    panel.classList.toggle('is-active', isActive);
    panel.hidden = !isActive;
  }
  if (tabName === 'subscriptions') {
    loadSubscriptions();
  }
}

for (const button of tabButtons) {
  button.addEventListener('click', () => {
    setActiveTab(button.dataset.tab);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (activeTab === 'subscriptions') {
    downloadButton.disabled = true;
    setStatus('Running', 'is-running');
    showResult('订阅更新中', '正在串行更新订阅 UP 主...');
    try {
      const response = await fetch('/api/subscriptions/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commonPayload()),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      setStatus('Done', 'is-done');
      showResult('订阅完成', payload);
    } catch (error) {
      setStatus('Error', 'is-error');
      showResult('错误', error.message || String(error));
    } finally {
      downloadButton.disabled = false;
    }
    return;
  }
  downloadButton.disabled = true;
  setStatus('Running', 'is-running');
  showResult('下载中', '正在串行请求 Bilibili 接口，请稍等...');

  try {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...commonPayload(),
        input: videoInput.value,
        uploaderMode: activeTab === 'uploader',
        uploader: uploaderInput.value,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    if (payload.status === 'completed') {
      setStatus('Done', 'is-done');
      showResult('批量完成', payload);
    } else if (payload.status === 'downloaded') {
      setStatus('Done', 'is-done');
      showResult('已下载', payload);
    } else if (payload.status === 'audio-downloaded') {
      setStatus('Done', 'is-done');
      showResult('已下载音频', payload);
    } else if (payload.status === 'auth-required') {
      setStatus('Need Cookie', 'is-error');
      showResult('需要权限', payload);
    } else {
      setStatus('No Subs', '');
      showResult('无字幕', payload);
    }
  } catch (error) {
    setStatus('Error', 'is-error');
    showResult('错误', error.message || String(error));
  } finally {
    downloadButton.disabled = false;
  }
});

detailToggle.addEventListener('click', () => {
  if (!lastPayload || detailToggle.disabled) return;
  detailsVisible = !detailsVisible;
  updateDetailVisibility();
});

clearButton.addEventListener('click', () => {
  setStatus('Ready', '');
  lastPayload = null;
  detailsVisible = false;
  resultKind.textContent = '等待任务';
  summaryOutput.textContent = '还没有运行下载任务。';
  resultOutput.textContent = '';
  resultOutput.hidden = true;
  detailToggle.disabled = true;
  detailToggle.textContent = '显示详情';
});

openOutputButton.addEventListener('click', async () => {
  openOutputButton.disabled = true;
  try {
    const response = await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outputDir: outputInput.value }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    showResult('已打开目录', payload);
  } catch (error) {
    setStatus('Error', 'is-error');
    showResult('错误', error.message || String(error));
  } finally {
    openOutputButton.disabled = false;
  }
});

function renderSubscriptions(subscriptions) {
  if (!subscriptions.length) {
    subscriptionList.innerHTML = '<div class="empty-state"><h2>订阅更新</h2><p>还没有订阅 UP 主。</p></div>';
    return;
  }
  subscriptionList.innerHTML = '';
  for (const subscription of subscriptions) {
    const item = document.createElement('div');
    item.className = 'subscription-item';
    item.innerHTML = `
      <div>
        <strong></strong>
        <span></span>
      </div>
      <button type="button" class="secondary" data-remove-subscription="${subscription.mid}">删除</button>
    `;
    item.querySelector('strong').textContent = subscription.name || subscription.mid;
    item.querySelector('span').textContent = `ID: ${subscription.mid}`;
    subscriptionList.appendChild(item);
  }
}

async function loadSubscriptions() {
  try {
    const response = await fetch('/api/subscriptions');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    renderSubscriptions(payload.subscriptions || []);
  } catch (error) {
    subscriptionList.innerHTML = `<div class="empty-state"><h2>订阅更新</h2><p>${error.message || String(error)}</p></div>`;
  }
}

addSubscriptionButton.addEventListener('click', async () => {
  const input = subscriptionInput.value.trim();
  if (!input) return;
  addSubscriptionButton.disabled = true;
  setStatus('Running', 'is-running');
  try {
    const response = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, cookieText: cookieInput.value }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    subscriptionInput.value = '';
    setStatus('Ready', '');
    showResult('已添加订阅', payload);
    await loadSubscriptions();
  } catch (error) {
    setStatus('Error', 'is-error');
    showResult('错误', error.message || String(error));
  } finally {
    addSubscriptionButton.disabled = false;
  }
});

subscriptionList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-remove-subscription]');
  if (!button) return;
  button.disabled = true;
  try {
    const response = await fetch(`/api/subscriptions/${encodeURIComponent(button.dataset.removeSubscription)}`, {
      method: 'DELETE',
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    showResult('已删除订阅', payload);
    await loadSubscriptions();
  } catch (error) {
    setStatus('Error', 'is-error');
    showResult('错误', error.message || String(error));
  }
});
