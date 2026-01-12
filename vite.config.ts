import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  publicDir: 'Assets',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    rollupOptions: {
      input: './index.html'
    }
  }
})