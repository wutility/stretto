import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import path from 'node:path';

export default defineConfig({
  plugins: [
    dts({
      compilerOptions: { removeComments: true },
      insertTypesEntry: true,
      tsconfigPath: './tsconfig.build.json'
    }),
  ],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'stretto',
      fileName: (format) => format === 'es' ? 'stretto.js' : `stretto.${format}.js`,
      formats: ['es', 'umd'],
    },
    sourcemap: false,
  }
});