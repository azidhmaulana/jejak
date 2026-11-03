import { createApp } from './app.mjs';

const app = await createApp({
  directory: process.env.JEJAK_DATA_DIR || '.runtime',
  serveDist: process.argv.includes('--production'),
});
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4174);
const server = app.listen(port, host, () =>
  console.log(
    `JEJAK ${process.argv.includes('--production') ? 'app' : 'API'}: http://${host}:${port}`,
  ),
);
server.requestTimeout = 60 * 60 * 1000;
async function shutdown() {
  await app.locals.close();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
