const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { downloadBatchSubtitles, parseBatchInputs } = require('./batch-downloader');
const { parseCookieText } = require('./cookie');
const { downloadVideoSubtitles } = require('./downloader');
const { downloadUploaderSubtitles } = require('./uploader');
const {
  addSubscription,
  addSubscriptions,
  listSubscriptions,
  removeSubscription,
  updateSubscriptions,
} = require('./subscriptions');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function openFolder(folderPath) {
  return new Promise((resolve, reject) => {
    const quotedPath = String(folderPath).replace(/'/g, "''");
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Start-Process -FilePath explorer.exe -ArgumentList '${quotedPath}'`,
    ], {
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`open folder failed: exit ${code}`));
      }
    });
  });
}

function parseDateBoundary(value, endOfDay = false) {
  const text = String(value || '').trim();
  if (!text) return undefined;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid date: ${text}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const milliseconds = endOfDay
    ? Date.UTC(year, month, day, 23, 59, 59)
    : Date.UTC(year, month, day, 0, 0, 0);
  return Math.floor(milliseconds / 1000);
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function createGuiServer(options = {}) {
  const publicDir = options.publicDir || path.join(__dirname, '..', 'public');
  const runDownload = options.downloadVideoSubtitles || downloadVideoSubtitles;
  const runBatchDownload = options.downloadBatchSubtitles || downloadBatchSubtitles;
  const runUploaderDownload = options.downloadUploaderSubtitles || downloadUploaderSubtitles;
  const runListSubscriptions = options.listSubscriptions || listSubscriptions;
  const runAddSubscription = options.addSubscription || addSubscription;
  const runAddSubscriptions = options.addSubscriptions || addSubscriptions;
  const runRemoveSubscription = options.removeSubscription || removeSubscription;
  const runUpdateSubscriptions = options.updateSubscriptions || updateSubscriptions;
  const runOpenFolder = options.openFolder || openFolder;
  const runShutdown = options.shutdown;

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');

      if (request.method === 'POST' && url.pathname === '/api/shutdown') {
        sendJson(response, 200, { stopping: true });
        setTimeout(() => {
          if (runShutdown) {
            runShutdown();
            return;
          }
          server.close(() => process.exit(0));
        }, 50);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/open-folder') {
        const body = await readRequestJson(request);
        const outputDir = String(body.outputDir || 'downloads').trim() || 'downloads';
        const folderPath = path.resolve(outputDir);
        await fs.mkdir(folderPath, { recursive: true });
        await runOpenFolder(folderPath);
        sendJson(response, 200, { opened: true, path: folderPath });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/subscriptions') {
        sendJson(response, 200, { subscriptions: await runListSubscriptions() });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/subscriptions') {
        const body = await readRequestJson(request);
        const result = await runAddSubscriptions({
          input: body.input,
          cookie: parseCookieText(body.cookieText || ''),
        });
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/subscriptions/')) {
        const mid = Number(decodeURIComponent(url.pathname.replace('/api/subscriptions/', '')));
        sendJson(response, 200, await runRemoveSubscription({ mid }));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/subscriptions/update') {
        const body = await readRequestJson(request);
        const result = await runUpdateSubscriptions({
          outputDir: String(body.outputDir || 'downloads').trim() || 'downloads',
          cookie: parseCookieText(body.cookieText || ''),
          chineseOnly: Boolean(body.chineseOnly),
          plainText: Boolean(body.plainText),
          renameByTitle: Boolean(body.renameByTitle),
          downloadAudioWhenNoSubtitles: Boolean(body.downloadAudioWhenNoSubtitles),
          groupByDate: Boolean(body.groupByDate),
          incrementalUpdate: body.incrementalUpdate !== false,
          delayMs: Number(body.delayMs || 800),
          publishedAfter: parseDateBoundary(body.startDate),
          publishedBefore: parseDateBoundary(body.endDate, true),
        });
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/download') {
        const body = await readRequestJson(request);
        const commonOptions = {
          outputDir: String(body.outputDir || 'downloads').trim() || 'downloads',
          cookie: parseCookieText(body.cookieText || ''),
          chineseOnly: Boolean(body.chineseOnly),
          plainText: Boolean(body.plainText),
          renameByTitle: Boolean(body.renameByTitle),
          downloadAudioWhenNoSubtitles: Boolean(body.downloadAudioWhenNoSubtitles),
        };
        if (body.uploaderMode) {
          const uploader = String(body.uploader || '').trim();
          if (!uploader) {
            sendJson(response, 400, { error: 'Uploader name, id, or space URL is required.' });
            return;
          }
          const result = await runUploaderDownload({
            ...commonOptions,
            uploader,
            delayMs: Number(body.delayMs || 800),
            incrementalUpdate: Boolean(body.incrementalUpdate),
            groupByDate: Boolean(body.groupByDate),
            publishedAfter: parseDateBoundary(body.startDate),
            publishedBefore: parseDateBoundary(body.endDate, true),
          });
          sendJson(response, 200, result);
          return;
        }

        const input = String(body.input || '').trim();
        if (!input) {
          sendJson(response, 400, { error: 'Video URL or BV id is required.' });
          return;
        }

        const inputs = parseBatchInputs(input);
        const result = inputs.length > 1 ? await runBatchDownload({
          ...commonOptions,
          inputs,
          delayMs: Number(body.delayMs || 800),
        }) : await runDownload({
          ...commonOptions,
          input: inputs[0],
        });
        sendJson(response, 200, result);
        return;
      }

      if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'Method not allowed.' });
        return;
      }

      const routePath = url.pathname === '/' ? '/index.html' : url.pathname;
      const safePath = path.normalize(routePath).replace(/^(\.\.[/\\])+/, '');
      const filePath = path.join(publicDir, safePath);
      const relative = path.relative(publicDir, filePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        sendJson(response, 403, { error: 'Forbidden.' });
        return;
      }

      const content = await fs.readFile(filePath);
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(content);
    } catch (error) {
      const statusCode = error.code === 'ENOENT' ? 404 : 500;
      sendJson(response, statusCode, { error: error.message || String(error) });
    }
  });

  return server;
}

module.exports = { createGuiServer };
