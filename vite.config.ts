import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      rollupTypes: true,
      tsconfigPath: './tsconfig.json',
    }),
  ],

  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'stretto',
      fileName: (format) => format === 'es' ? 'stretto.js' : `stretto.${format}.js`,
      formats: ['es', 'cjs', 'umd'],
    },

    rollupOptions: {
      external: (id) => !id.startsWith('.') && !id.startsWith('/'),
    },

    sourcemap: false,
    minify: 'terser',
  },
});