import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Версия генерируется на каждую сборку: «задеплоил = уведомил пользователей».
// Формат совместим со старым ручным: ГГГГ.ММ.ДД.ЧЧММ.
function buildVersion() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}.${p(d.getHours())}${p(d.getMinutes())}`;
}

const APP_VERSION = buildVersion();

// Пишет dist/version.json той же версией, что вшита в бандл (define ниже),
// чтобы update-flow в приложении сравнивал одинаковые значения.
function versionJsonPlugin() {
  return {
    name: 'emit-version-json',
    apply: 'build',
    closeBundle() {
      const outDir = resolve(process.cwd(), 'dist');
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        resolve(outDir, 'version.json'),
        JSON.stringify({ version: APP_VERSION, mandatory: false, message: 'Доступно обновление MoteoTracker' }, null, 2) + '\n',
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), versionJsonPlugin()],
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: {
    outDir: 'dist',
  },
});
