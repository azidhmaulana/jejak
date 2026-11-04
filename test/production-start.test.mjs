import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test(
  'production entrypoint enables secure sessions without NODE_ENV and blocks private files',
  { timeout: 20000 },
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'jejak-production-'));
    const child = spawn(process.execPath, ['server/index.mjs', '--production'], {
      env: {
        ...process.env,
        NODE_ENV: 'development',
        HOST: '127.0.0.1',
        PORT: '0',
        JEJAK_DATA_DIR: directory,
        MAP_DATA_DIR: path.join(directory, 'maps'),
        MAP_ASSET_DIR: path.join(directory, 'assets'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      const base = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Production startup timed out')), 10000);
        child.once('error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.once('exit', () => {
          clearTimeout(timer);
          reject(new Error('Production exited before ready'));
        });
        child.stdout.on('data', (chunk) => {
          const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
          if (match) {
            clearTimeout(timer);
            resolve(match[0]);
          }
        });
      });
      assert.equal((await fetch(base + '/api/health')).status, 200);
      for (const file of ['/.runtime/setup-token.txt', '/server/auth/service.mjs', '/.env'])
        assert.equal((await fetch(base + file)).status, 404);
      const token = (await readFile(path.join(directory, 'setup-token.txt'), 'utf8')).trim();
      const response = await fetch(base + '/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          name: 'Release Test',
          email: 'release@example.test',
          password: 'Release-test-password-123',
        }),
      });
      assert.equal(response.status, 200);
      const cookie = response.headers.get('set-cookie');
      assert.match(cookie, /; Secure/i);
      assert.match(cookie, /; HttpOnly/i);
      assert.match(cookie, /; SameSite=Strict/i);
    } finally {
      if (child.exitCode === null) {
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
);
