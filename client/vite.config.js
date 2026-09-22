import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server listens on the network (host: true) and proxies API + websockets to the Express server.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
});
