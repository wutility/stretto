import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import path from 'node:path';
import pkg from "./package.json" assert { type: "json" };

const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * (c) ${new Date().getFullYear()}
 * Contributors: @haikelfazzani
 * Released under the ${pkg.license} License
 */
`;

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      tsconfigPath: './tsconfig.build.json',
      rollupTypes: true,
      outDir: "dist/types",
    }),
  ],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'mod.ts'),
      name: 'stretto',
      fileName: (format) => format === 'es' ? 'index.js' : `index.${format}.js`,
      formats: ['es', 'umd'],
    },
    sourcemap: false,
    rollupOptions: {
      output: {
        exports: "named",
        banner,
      },
    },
  }
});