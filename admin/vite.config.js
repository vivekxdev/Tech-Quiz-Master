import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The admin app always lives on 5174; the learner app owns 5173. Pinning the
  // port stops Vite from silently drifting to another one when 5173 is free.
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
})
