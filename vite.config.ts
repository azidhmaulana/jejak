import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.JEJAK_API_URL || 'http://127.0.0.1:4174';
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: Number(env.JEJAK_WEB_PORT || 5173),
      strictPort: true,
      proxy: {
        '/api': { target, changeOrigin: false },
        '/offline-maps': { target, changeOrigin: false },
      },
    },
  };
});
