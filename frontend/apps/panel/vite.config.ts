import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 后端地址：dev 时由 `make dev PANEL_PORT=xxxx` 通过 VITE_API_TARGET 注入，默认 :9999
const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:9999/';

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
    },
    server: {
        host: '0.0.0.0',
        port: 4005,
        open: false,
        proxy: {
            '/api/v1': {
                target: apiTarget,
                changeOrigin: true,
                ws: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: mode !== 'production',
        target: 'esnext',
        chunkSizeWarningLimit: 2000,
        rollupOptions: {
            output: {
                manualChunks: {
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-redux': ['@reduxjs/toolkit', 'react-redux'],
                    'vendor-echarts': ['echarts'],
                    'vendor-xterm': ['@xterm/xterm', '@xterm/addon-fit'],
                },
            },
        },
    },
}));
