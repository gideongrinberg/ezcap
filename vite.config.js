import { defineConfig } from "vite"
export default defineConfig({
    root: './src',
    build: {
        outDir: 'dist/'
    },
    optimizeDeps: {
        exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
    }
})