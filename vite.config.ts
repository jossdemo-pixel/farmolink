
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    cors: false
  },
  build: {
    target: 'es2020', // Melhor compatibilidade com Android
    minify: 'terser',
    sourcemap: false, // Reduz tamanho do APK
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom'],
          'supabase': ['@supabase/supabase-js'],
          'lucide': ['lucide-react']
        }
      }
    },
    // Otimização de assets
    assetsInlineLimit: 4096,
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === 'production' // Remove console.log em produção
      }
    }
  },
  // Otimização de cache
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production')
  }
});
