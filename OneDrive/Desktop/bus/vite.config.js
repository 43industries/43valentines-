import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  if (process.env.VERCEL && mode === 'production') {
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter(
      (k) => !env[k]?.trim(),
    );
    if (missing.length) {
      throw new Error(
        `Vercel build: set ${missing.join(', ')} in Project → Settings → Environment Variables (Vite only exposes VITE_*).`,
      );
    }
  }

  return {
    root: '.',
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          driver: resolve(__dirname, 'driver.html'),
          track: resolve(__dirname, 'track.html'),
        },
      },
    },
  };
});
