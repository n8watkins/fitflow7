import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The release name error reports carry (lib/monitoring.ts).
  define: { __APP_RELEASE__: JSON.stringify(`fitflow7@${pkg.version}`) },
})
