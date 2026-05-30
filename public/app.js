const form = document.querySelector('#download-form');
const uploaderModeInput = document.querySelector('#uploader-mode-input');
const uploaderInput = document.querySelector('#uploader-input');
const videoInput = document.querySelector('#video-input');
const cookieInput = document.querySelector('#cookie-input');
const outputInput = document.querySelector('#output-input');
const startDateInput = document.querySelector('#start-date-input');
const endDateInput = document.querySelector('#end-date-input');
const chineseOnlyInput = document.querySelector('#chinese-only-input');
const plainTextInput = document.querySelector('#plain-text-input');
const renameByTitleInput = document.querySelector('#rename-by-title-input');
const delayInput = document.querySelector('#delay-input');
const statusEl = document.querySelector('#status');
const resultKind = document.querySelector('#result-kind');
const summaryOutput = document.querySelector('#summary-output');
const resultOutput = document.querySelector('#result-output');
const detailToggle = document.querySelector('#detail-toggle');
const downloadButton = document.querySelector('#download-button');
const clearButton = document.querySelector('#clear-button');

let lastPayload = null;
let detailsVisible = false;

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

  const lines = [];
  lines.push(`视频：${payload.bvid ? videoUrl(payload.bvid) : payload.input || ''}`);
  lines.push(`状态：${payload.status || 'unknown'}`);
  lines.push(`成功下载：${payload.status === 'downloaded' ? payload.downloaded.length : 0}`);
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
  detailToggle.hidden = typeof payload === 'string' || !payload;
  updateDetailVisibility();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  downloadButton.disabled = true;
  setStatus('Running', 'is-running');
  showResult('下载中', '正在串行请求 Bilibili 接口，请稍等...');

  try {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: videoInput.value,
        uploaderMode: uploaderModeInput.checked,
        uploader: uploaderInput.value,
        cookieText: cookieInput.value,
        outputDir: outputInput.value,
        startDate: startDateInput.value,
        endDate: endDateInput.value,
        chineseOnly: chineseOnlyInput.checked,
        plainText: plainTextInput.checked,
        renameByTitle: renameByTitleInput.checked,
        delayMs: Number(delayInput.value || 800),
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
  if (!lastPayload) return;
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
  detailToggle.hidden = true;
});
