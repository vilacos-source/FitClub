import { defineConfig, devices } from '@playwright/test';

/**
 * Config de los smoke tests de FitClub.
 *
 * BASE_URL apunta al despliegue a verificar (con barra final):
 *   - por defecto, la web pública de GitHub Pages
 *   - en local: BASE_URL=http://localhost:4173/ npx playwright test
 *
 * Ojo con dos trampas ya encontradas (rompían la batería entera, no la app):
 *  1. `waitUntil: 'networkidle'` nunca se cumple: Firestore mantiene un stream
 *     abierto. Usar siempre 'domcontentloaded' + espera explícita.
 *  2. El dominio resuelve solo por IPv6 en algunas VMs/CI sin ruta IPv6, y
 *     Chromium sirve entonces un 404 de GitHub Pages. Forzamos IPv4.
 *  3. `baseURL` debe terminar en '/' o `page.goto('/')` se resuelve contra el
 *     dominio raíz en lugar del subpath.
 */
const BASE_URL = process.env.BASE_URL || 'https://vilacos-source.github.io/FitClub/';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-reports/results.json' }],
    ['html', { outputFolder: 'test-reports/html', open: 'never' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,  // solo informativo; los tests usan APP_URL completo
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        launchOptions: {
          args: ['--host-resolver-rules=MAP vilacos-source.github.io 185.199.108.153'],
        },
      },
    },
  ],
});
