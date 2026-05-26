'use strict';

// Server entry point. Boots the Express app and listens on the configured
// port. Kept thin so tests can use the app factory directly.

const env = require('./config/env');
const { createApp } = require('./app');

const app = createApp();

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[progr.am] listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`[progr.am] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
