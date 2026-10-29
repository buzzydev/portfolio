const env = require('./config/env');

const problems = env.validate();
if (problems.length) {
  console.error('Configuration error:\n - ' + problems.join('\n - '));
  if (env.isProd) process.exit(1);
  console.error('Continuing in development mode; copy .env.example to .env to fix this.');
}

const { createApp } = require('./app');
const { disconnect } = require('./config/db');

const app = createApp();
const server = app.listen(env.port, '0.0.0.0', () => console.log(`Listening on port ${env.port}`));

function shutdown() {
  server.close(async () => {
    await disconnect().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
