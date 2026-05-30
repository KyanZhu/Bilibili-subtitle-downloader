#!/usr/bin/env node

const fs = require('node:fs/promises');
const { parseCookieText } = require('../src/cookie');
const { downloadVideoSubtitles } = require('../src/downloader');

function printUsage() {
  console.log('Usage: node bin/download-bilibili-subtitle.js <bilibili-url-or-bvid> [--output downloads] [--cookie "..."] [--cookie-file cookies.txt] [--rename-by-title]');
}

function parseArgs(argv) {
  const args = { outputDir: 'downloads', cookie: '' };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output' || arg === '-o') {
      args.outputDir = argv[++index];
    } else if (arg === '--cookie') {
      args.cookie = argv[++index] || '';
    } else if (arg === '--cookie-file') {
      args.cookieFile = argv[++index];
    } else if (arg === '--rename-by-title') {
      args.renameByTitle = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      positionals.push(arg);
    }
  }

  args.input = positionals[0];
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  let cookie = args.cookie;
  if (args.cookieFile) {
    cookie = parseCookieText(await fs.readFile(args.cookieFile, 'utf8'));
  }

  const result = await downloadVideoSubtitles({
    input: args.input,
    outputDir: args.outputDir,
    cookie,
    renameByTitle: args.renameByTitle,
  });

  if (result.status === 'downloaded') {
    console.log(`status=downloaded bvid=${result.bvid} subtitles=${result.downloaded.length}`);
  } else if (result.status === 'auth-required') {
    console.log(`status=auth-required bvid=${result.bvid} message="subtitle metadata requires login or purchase cookies"`);
  } else {
    console.log(`status=no-subtitles bvid=${result.bvid}`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
