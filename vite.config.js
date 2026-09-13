import { defineConfig } from 'vite';

export default defineConfig({
  base: '/looply/',
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
});
