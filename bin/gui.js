#!/usr/bin/env node

const { createGuiServer } = require('../src/gui-server');

const portArgIndex = process.argv.indexOf('--port');
const port = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : Number(process.env.PORT || 4757);
const host = '127.0.0.1';
const server = createGuiServer();

server.listen(port, host, () => {
  console.log(`Bilibili Subtitle Downloader GUI`);
  console.log(`Open http://${host}:${port}`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
