const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { writeCollectedPlainText } = require('../src/plain-text-collector');

test('writes collected plain text to yyyy-mm-dd file under output directory', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-collect-'));
  const videoDir = path.join(temp, '2026-05-31', 'BV_TEST');
  const subtitlesDir = path.join(videoDir, 'subtitles');
  await fs.mkdir(subtitlesDir, { recursive: true });
  const txtPath = path.join(subtitlesDir, 'p01-zh.txt');
  await fs.writeFile(txtPath, '第一句\n第二句\n\n第三句\n', 'utf8');

  const filePath = await writeCollectedPlainText({
    bvid: 'BV_TEST',
    title: '测试标题',
    downloaded: [{ txtPath }],
  }, {
    outputDir: temp,
    now: new Date('2026-05-31T10:20:30'),
  });

  assert.equal(filePath, path.join(temp, '2026-05-31.txt'));
  assert.equal(await fs.readFile(filePath, 'utf8'), [
    '标题: 测试标题',
    'ID: BV_TEST',
    '字幕: 第一句 第二句 第三句',
    '',
  ].join('\n'));
});

test('writes collected plain text with a filename suffix', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-collect-'));
  const videoDir = path.join(temp, 'BV_TEST');
  const subtitlesDir = path.join(videoDir, 'subtitles');
  await fs.mkdir(subtitlesDir, { recursive: true });
  const txtPath = path.join(subtitlesDir, 'p01-zh.txt');
  await fs.writeFile(txtPath, 'hello', 'utf8');

  const filePath = await writeCollectedPlainText({
    bvid: 'BV_TEST',
    downloaded: [{ txtPath }],
  }, {
    outputDir: temp,
    filenameSuffix: '股评',
    now: new Date('2026-06-02T10:20:30'),
  });

  assert.equal(filePath, path.join(temp, '2026-06-02-股评.txt'));
});
