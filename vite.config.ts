import { join } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Security headers for every response. Netlify sets them from `netlify.toml`; `vite preview` sets
 * them from this object so the e2e suite runs under the same policy. tests/boot/boot.test.ts checks the
 * two stay identical.
 *
 * - `'wasm-unsafe-eval'`: lets Rapier compile its WebAssembly without allowing JS `eval`.
 * - `style-src 'unsafe-inline'`: the UI builds its styles at runtime (`<style>` + style attributes).
 * - `blob:`/`data:`: glTF textures and procedural images/audio may be decoded from blobs.
 * - No third-party origins at all: the game makes no network calls except to its own files.
 * - No Cross-Origin-Opener-Policy: the game opens no windows, and in Chromium it made every page
 *   load start with a cold shader cache (first frame ~1.5 s slower under SwiftShader).
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

/**
 * `@dimforge/rapier3d-compat` inlines its 3 MB WASM as a 4 MB base64 string inside the JS bundle:
 * slow to download (base64 compresses badly), slow to parse, and decoded on the main thread.
 * In production builds we cut that string out and let wasm-bindgen fetch the real `.wasm` file
 * instead (hashed, cached forever, streamed and compiled while it downloads). Dev and Vitest keep
 * the stock base64 path. The build fails loudly if a Rapier update changes the pattern.
 */
function rapierWasmFile(): Plugin {
  const wasmPath = join(process.cwd(), 'node_modules/@dimforge/rapier3d-compat/dist/rapier_wasm3d_bg.wasm').replace(/\\/g, '/');
  const inline = /module_or_path:([\w$]+)\.toByteArray\("[A-Za-z0-9+/=]+"\)(\.buffer)?/g;
  return {
    name: 'rg:rapier-wasm-file',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!/rapier3d-compat[\\/]dist[\\/]rapier\.mjs$/.test(id.split('?')[0])) return null;
      const hits = code.match(inline)?.length ?? 0;
      if (hits !== 1) this.error(`rapier-wasm-file: expected 1 inlined WASM blob, found ${hits}`);
      const out = code.replace(inline, 'module_or_path:__rgRapierWasm');
      return { code: `import __rgRapierWasm from ${JSON.stringify(`${wasmPath}?url`)};\n${out}`, map: null };
    },
    // Start the WASM download with the HTML (it is the biggest file the title screen needs).
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const wasm = Object.keys(ctx.bundle ?? {}).find((f) => /rapier_wasm3d_bg.*\.wasm$/.test(f));
        if (!wasm) return [];
        return [{ tag: 'link', attrs: { rel: 'preload', href: `./${wasm}`, as: 'fetch', type: 'application/wasm', crossorigin: '' }, injectTo: 'head' }];
      },
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [rapierWasmFile()],
  build: {
    // Hashed output lives in dist/build (immutable cache). public/assets is copied unhashed.
    assetsDir: 'build',
    target: 'es2022',
    // Never inline assets as base64 (the WASM above, and anything else): files compress better.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // Named vendor chunks (stable hashes across game-code changes, clear boot:requests logs).
        // Game systems split naturally at the dynamic imports in src/main.ts.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'postfx', test: /node_modules[\\/]postprocessing[\\/]/ },
            { name: 'rapier', test: /node_modules[\\/]@dimforge[\\/]/ },
          ],
        },
      },
    },
  },
  server: { host: true },
  // Same security headers as netlify.toml, so the e2e suite runs under the production CSP.
  preview: { headers: SECURITY_HEADERS },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'node',
  },
});
