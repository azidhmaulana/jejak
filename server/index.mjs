import { createApp } from './app.mjs';

const production = process.argv.includes('--production');
if (production) process.env.NODE_ENV = 'production';

const app = await createApp({
  directory: process.env.JEJAK_DATA_DIR || '.runtime',
  serveDist: production,
});
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4174);
const server = app.listen(port, host, () =>
  console.log(`JEJAK ${production ? 'app' : 'API'}: http://${host}:${server.address().port}`),
);
server.requestTimeout = 120000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 1000;
async function shutdown() {
  await app.locals.close();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
