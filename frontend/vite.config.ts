import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "VITE_");
  return {
    plugins: [react(), {
      name: 'lohni-offline-shell',
      apply: 'build',
      enforce: 'post',
      generateBundle(_options, bundle) {
        const assets = ['/', '/app.css', '/logo.png', '/fonts/schibsted_grotesk.woff2', '/manifest.webmanifest',
          '/icons/lohni-180.png', '/icons/lohni-192.png', '/icons/lohni-512.png',
          ...Object.keys(bundle).filter(name => name !== 'index.html').map(name => `/${name}`)];
        const template = readFileSync(path.resolve(__dirname, 'sw.js'), 'utf8');
        const hash = createHash('sha256').update(template);
        for (const asset of assets) {
          const output = bundle[asset === '/' ? 'index.html' : asset.slice(1)];
          hash.update(asset).update(output ? (output.type === 'chunk' ? output.code : output.source)
            : readFileSync(path.resolve(__dirname, 'public', asset.slice(1))));
        }
        const version = hash.digest('hex').slice(0, 16);
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: template
          .replace('__CACHE_VERSION__', `lohni-shell-${version}`)
          .replace('__PRECACHE_ASSETS__', JSON.stringify(assets)) });
      },
    }],
    server: {
      host: env.VITE_FRONTEND_HOST || "localhost",
      port: Number(env.VITE_FRONTEND_PORT) || 5173,
    },
    preview: {
      host: env.VITE_FRONTEND_HOST || "localhost",
      port: Number(env.VITE_FRONTEND_PORT) || 4173,
    },
    envDir: path.resolve(__dirname, ".."),
  };
});
