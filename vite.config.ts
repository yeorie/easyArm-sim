import { defineConfig } from 'vite';

const productionPolicy = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

export default defineConfig({
  base: '/easyArm-sim/',
  plugins: [{
    name: 'production-content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [{
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: productionPolicy },
        injectTo: 'head-prepend',
      }];
    },
  }],
});
