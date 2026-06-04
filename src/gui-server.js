const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { downloadBatchSubtitles, parseBatchInputs } = require('./batch-downloader');
const { parseCookieText } = require('./cookie');
const { downloadVideoSubtitles, sanitizeName } = require('./downloader');
const { writeCollectedPlainText } = require('./plain-text-collector');
const { downloadUploaderSubtitles } = require('./uploader');
const {
  addSubscriptionGroup,
  addSubscription,
  addSubscriptions,
  listSubscriptionGroups,
  listSubscriptions,
  removeSubscriptionGroup,
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

function sendJsonLine(response, payload) {
  response.write(`${JSON.stringify(payload)}\n`);
}

function startStream(response) {
  response.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
  });
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

function groupedSubscriptionResults(result) {
  const groups = new Map();
  for (const item of (result && result.results) || []) {
    const group = sanitizeName(item && item.subscription ? item.subscription.group : '');
    const key = group || '';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  }
  return groups;
}

async function writeSubscriptionCollectedPlainText(result, options = {}) {
  const paths = [];
  const groups = groupedSubscriptionResults(result);
  for (const [group, results] of groups) {
    const outputDir = group ? path.join('downloads', group) : 'downloads';
    const collectionPath = await options.writeCollectedPlainText({ ...result, results }, {
      outputDir,
      filenameSuffix: group,
      now: options.now,
    });
    if (collectionPath) {
      paths.push(collectionPath);
    }
  }
  return paths;
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
  const runListSubscriptionGroups = options.listSubscriptionGroups || listSubscriptionGroups;
  const runAddSubscriptionGroup = options.addSubscriptionGroup || addSubscriptionGroup;
  const runRemoveSubscriptionGroup = options.removeSubscriptionGroup || removeSubscriptionGroup;
  const runListSubscriptions = options.listSubscriptions || listSubscriptions;
  const runAddSubscription = options.addSubscription || addSubscription;
  const runAddSubscriptions = options.addSubscriptions || addSubscriptions;
  const runRemoveSubscription = options.removeSubscription || removeSubscription;
  const runUpdateSubscriptions = options.updateSubscriptions || updateSubscriptions;
  const runOpenFolder = options.openFolder || openFolder;
  const runWriteCollectedPlainText = options.writeCollectedPlainText || writeCollectedPlainText;
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

      if (request.method === 'GET' && url.pathname === '/api/subscription-groups') {
        sendJson(response, 200, { groups: await runListSubscriptionGroups() });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/subscription-groups') {
        const body = await readRequestJson(request);
        sendJson(response, 200, await runAddSubscriptionGroup({ group: body.group || body.name }));
        return;
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/subscription-groups/')) {
        const group = decodeURIComponent(url.pathname.replace('/api/subscription-groups/', ''));
        sendJson(response, 200, await runRemoveSubscriptionGroup({ group }));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/subscriptions') {
        const body = await readRequestJson(request);
        const result = await runAddSubscriptions({
          input: body.input,
          group: body.group,
          cookie: parseCookieText(body.cookieText || ''),
          delayMs: Number(body.delayMs || 800),
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
        const outputDir = String(body.outputDir || 'downloads').trim() || 'downloads';
        const streamLogs = Boolean(body.streamLogs);
        if (streamLogs) {
          startStream(response);
        }
        const onProgress = streamLogs ? (event) => sendJsonLine(response, {
          type: 'log',
          message: event.message,
          event,
        }) : undefined;
        const result = await runUpdateSubscriptions({
          outputDir,
          cookie: parseCookieText(body.cookieText || ''),
          chineseOnly: Boolean(body.chineseOnly),
          plainText: Boolean(body.plainText || body.collectPlainText),
          renameByTitle: Boolean(body.renameByTitle),
          collectPlainText: Boolean(body.collectPlainText),
          downloadAudioWhenNoSubtitles: Boolean(body.downloadAudioWhenNoSubtitles),
          groupByDate: Boolean(body.groupByDate),
          subscriptionGroup: body.subscriptionGroup,
          incrementalUpdate: body.incrementalUpdate !== false,
          delayMs: Number(body.delayMs || 800),
          onProgress,
          publishedAfter: parseDateBoundary(body.startDate),
          publishedBefore: parseDateBoundary(body.endDate, true),
        });
        if (body.collectPlainText) {
          const collectionPaths = await writeSubscriptionCollectedPlainText(result, {
            writeCollectedPlainText: runWriteCollectedPlainText,
            now: options.now,
          });
          if (collectionPaths.length > 0) {
            result.collectedPlainTextPaths = collectionPaths;
            result.collectedPlainTextPath = collectionPaths.join(', ');
          }
        }
        if (streamLogs) {
          sendJsonLine(response, { type: 'result', payload: result });
          response.end();
          return;
        }
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/download') {
        const body = await readRequestJson(request);
        const outputDir = String(body.outputDir || 'downloads').trim() || 'downloads';
        const streamLogs = Boolean(body.streamLogs);
        if (streamLogs) {
          startStream(response);
        }
        const onProgress = streamLogs ? (event) => sendJsonLine(response, {
          type: 'log',
          message: event.message,
          event,
        }) : undefined;
        const commonOptions = {
          outputDir,
          cookie: parseCookieText(body.cookieText || ''),
          chineseOnly: Boolean(body.chineseOnly),
          plainText: Boolean(body.plainText || body.collectPlainText),
          renameByTitle: Boolean(body.renameByTitle),
          collectPlainText: Boolean(body.collectPlainText),
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
            onProgress,
            publishedAfter: parseDateBoundary(body.startDate),
            publishedBefore: parseDateBoundary(body.endDate, true),
          });
          if (body.collectPlainText) {
            const collectionPath = await runWriteCollectedPlainText(result, {
              outputDir: 'downloads',
              now: options.now,
            });
            if (collectionPath) {
              result.collectedPlainTextPath = collectionPath;
            }
          }
          if (streamLogs) {
            sendJsonLine(response, { type: 'result', payload: result });
            response.end();
            return;
          }
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
          onProgress,
        }) : await runDownload({
          ...commonOptions,
          input: inputs[0],
        });
        if (inputs.length === 1 && streamLogs) {
          sendJsonLine(response, {
            type: 'log',
            message: result.status === 'error'
              ? `抓取失败: ${inputs[0]} (${result.error || ''})`
              : `成功抓取: ${result.title || result.bvid || inputs[0]}`,
          });
        }
        if (body.collectPlainText) {
          const collectionPath = await runWriteCollectedPlainText(result, {
            outputDir: 'downloads',
            now: options.now,
          });
          if (collectionPath) {
            result.collectedPlainTextPath = collectionPath;
          }
        }
        if (streamLogs) {
          sendJsonLine(response, { type: 'result', payload: result });
          response.end();
          return;
        }
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
      if (response.headersSent) {
        sendJsonLine(response, { type: 'error', error: error.message || String(error) });
        response.end();
        return;
      }
      const statusCode = error.code === 'ENOENT' ? 404 : 500;
      sendJson(response, statusCode, { error: error.message || String(error) });
    }
  });

  return server;
}

module.exports = { createGuiServer };
