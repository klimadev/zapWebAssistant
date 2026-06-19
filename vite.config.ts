import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import swc from 'unplugin-swc';

// ─── Plugin: copiar assets estáticos para dist/ ─────────────────────
function copyStatic(): Plugin {
  const assets = [
    'manifest.json',
    'icon.png',
    'src/sidebar.html',
  ];
  const dirs = ['libs'];
  return {
    name: 'copy-static',
    closeBundle() {
      for (const f of assets) {
        const src = resolve(__dirname, f);
        const dst = resolve(__dirname, 'dist', f.replace('src/', ''));
        if (!existsSync(src)) continue;
        if (!existsSync(resolve(__dirname, 'dist'))) mkdirSync(resolve(__dirname, 'dist'), { recursive: true });
        cpSync(src, dst, { force: true });
        console.log(`  ✓ copied ${f.replace('src/', '')}`);
      }
      for (const d of dirs) {
        const src = resolve(__dirname, d);
        const dst = resolve(__dirname, 'dist', d);
        if (!existsSync(src)) continue;
        cpSync(src, dst, { recursive: true, force: true });
        console.log(`  ✓ copied ${d}/`);
      }
    },
  };
}

// ─── Plugin: versão no manifest ─────────────────────────────────────
function manifestVersion(): Plugin {
  return {
    name: 'manifest-version',
    closeBundle() {
      const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
      const manifestPath = resolve(__dirname, 'dist', 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      manifest.version = pkg.version;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
      console.log(`  ✓ manifest version → ${pkg.version}`);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript' },
        target: 'es2022',
      },
      module: { type: 'es6' },
    }),
    copyStatic(),
    manifestVersion(),
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: false, passes: 2 },
      mangle: { reserved: ['JSZip', 'WPP'] },
      format: { comments: false },
    },
    sourcemap: false,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        content: resolve(__dirname, 'src/content.ts'),
        injected: resolve(__dirname, 'src/injected.ts'),
        sidebar: resolve(__dirname, 'src/sidebar.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
      // injected é carregado via chrome.runtime.getURL → precisa ser standalone
      // content e background são carregados isolated contexts
      // cada entry é independente, sem shared chunks entre eles
      preserveEntrySignatures: 'strict',
    },
  },
});
