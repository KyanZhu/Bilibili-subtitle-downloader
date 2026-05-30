const form = document.querySelector('#download-form');
const videoInput = document.querySelector('#video-input');
const cookieInput = document.querySelector('#cookie-input');
const outputInput = document.querySelector('#output-input');
const chineseOnlyInput = document.querySelector('#chinese-only-input');
const plainTextInput = document.querySelector('#plain-text-input');
const renameByTitleInput = document.querySelector('#rename-by-title-input');
const delayInput = document.querySelector('#delay-input');
const statusEl = document.querySelector('#status');
const resultKind = document.querySelector('#result-kind');
const resultOutput = document.querySelector('#result-output');
const downloadButton = document.querySelector('#download-button');
const clearButton = document.querySelector('#clear-button');

function setStatus(label, className) {
  statusEl.className = `status ${className || ''}`.trim();
  statusEl.textContent = label;
}

function showResult(kind, payload) {
  resultKind.textContent = kind;
  resultOutput.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
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
        cookieText: cookieInput.value,
        outputDir: outputInput.value,
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

clearButton.addEventListener('click', () => {
  setStatus('Ready', '');
  resultKind.textContent = '等待任务';
  resultOutput.textContent = '还没有运行下载任务。';
});
