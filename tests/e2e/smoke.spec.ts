import { test, expect, ConsoleMessage, Page } from '@playwright/test';
import { deleteTestAccount, newTestAccount } from './helpers/cleanup';

/**
 * Batería de smoke tests de FitClub.
 *
 * Objetivo: en cada despliegue detectar si rompemos funcionalidad fundamental.
 * Cada test imprime un diagnóstico claro (código de error Firebase incluido)
 * para que el feedback sea accionable.
 *
 * NOTA: no usar `waitUntil: 'networkidle'` — la app abre un stream persistente
 * de Firestore y networkidle nunca se cumple (cuelga el test).
 */

const KNOWN_FIREBASE_ERRORS: Record<string, string> = {
  'auth/operation-not-allowed':
    'El proveedor Email/Password está DESHABILITADO en Firebase Console → Authentication → Sign-in method. Actívalo.',
  'auth/unauthorized-domain':
    'El dominio publicado NO está en Firebase Console → Authentication → Settings → Authorized domains.',
  'auth/email-already-in-use':
    'Ese email ya tiene cuenta (esperado si el test se re-ejecuta).',
  'auth/weak-password':
    'Firebase rechaza la contraseña por débil (mínimo 6 caracteres).',
};

function diagnose(raw: string): string {
  for (const [code, hint] of Object.entries(KNOWN_FIREBASE_ERRORS)) {
    if (raw.includes(code)) return `${code} → ${hint}`;
  }
  return raw || '(sin mensaje)';
}

/** Carga la app y espera a que React monte el landing. */
async function loadApp(page: Page) {
  await gotoApp(page);
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return !!root && root.children.length > 0;
    },
    { timeout: 30_000 },
  );
}

/**
 * Navega a la app.
 *
 * OJO: usar la URL COMPLETA, no `page.goto('/')`. Playwright resuelve `'/'`
 * contra el ORIGEN del baseURL e ignora el subpath, así que en un despliegue
 * tipo GitHub Pages (`/FitClub/`) acaba en el dominio raíz y devuelve 404
 * de GitHub Pages. Esto rompía toda la batería sin que la app tuviera nada roto.
 */
const APP_URL = process.env.BASE_URL || 'https://vilacos-source.github.io/FitClub/';

function gotoApp(page: Page) {
  return page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
}

async function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.describe('FitClub smoke tests', () => {
  test('S1 - la app carga y renderiza el landing (no página en blanco)', async ({ page }) => {
    const errors = await collectErrors(page);
    const resp = await gotoApp(page);
    expect(resp?.status(), 'El servidor no devolvió 200').toBeLessThan(400);

    const root = page.locator('#root');
    await expect(root).toBeVisible();
    await expect
      .poll(async () => await root.locator('> *').count(), {
        message: 'El root está vacío: la app no montó (¿assets 404 / base path?)',
        timeout: 25_000,
      })
      .toBeGreaterThan(0);

    await expect(page.getByText('FitClub', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Empezar el Reto/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ya tengo cuenta/i })).toBeVisible();

    const fatal = errors.filter((e) => /Failed to load module|MIME type/i.test(e));
    expect(fatal, `Errores de carga de assets:\n${fatal.join('\n')}`).toHaveLength(0);
  });

  test('S2 - el formulario de registro se abre y tiene todos los campos', async ({ page }) => {
    await loadApp(page);
    await page.getByRole('button', { name: /Empezar el Reto/i }).click();

    await expect(page.getByText(/Crea tu perfil/i)).toBeVisible();
    await expect(page.getByPlaceholder('Email')).toBeVisible();
    await expect(page.getByPlaceholder('Contraseña')).toBeVisible();
    await expect(page.getByPlaceholder(/nombre real/i)).toBeVisible();
    await expect(page.getByPlaceholder(/Pseudónimo/i)).toBeVisible();
    await expect(page.getByPlaceholder(/Peso inicial/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Unirme al grupo/i })).toBeVisible();
  });

  test('S2b - el ojo de la contraseña alterna entre verla y ocultarla', async ({ page }) => {
    await loadApp(page);
    await page.getByRole('button', { name: /Empezar el Reto/i }).click();

    const password = page.getByPlaceholder('Contraseña');
    await password.fill('MiClave123');

    // Por defecto, oculta.
    await expect(password).toHaveAttribute('type', 'password');

    // El ojo la enseña…
    await page.getByRole('button', { name: /Mostrar contraseña/i }).click();
    await expect(password).toHaveAttribute('type', 'text');
    // …y no se pierde lo escrito al alternar.
    await expect(password).toHaveValue('MiClave123');

    // Y la vuelve a ocultar.
    await page.getByRole('button', { name: /Ocultar contraseña/i }).click();
    await expect(password).toHaveAttribute('type', 'password');
  });

  test('S3 - el registro de un usuario nuevo funciona de verdad', async ({ page }) => {
    const errors = await collectErrors(page);
    const dialogs: string[] = [];
    page.on('dialog', async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });

    // Cuenta de prueba con identificador único para esta ejecución.
    const email = `smoke+${Date.now()}@example.com`;
    const password = 'Prueba12345!';

    try {
      await loadApp(page);
      await page.getByRole('button', { name: /Empezar el Reto/i }).click();

      await page.getByPlaceholder('Email').fill(email);
      await page.getByPlaceholder('Contraseña').fill(password);
      await page.getByPlaceholder(/nombre real/i).fill('Smoke Test');
      await page.getByPlaceholder(/Pseudónimo/i).fill(`smoke${String(Date.now()).slice(-6)}`);
      await page.getByPlaceholder(/Peso inicial/i).fill('85');
      await page.getByRole('button', { name: /Unirme al grupo/i }).click();

      // Esperamos a que aparezca CUALQUIERA de las dos señales:
      //  - éxito: entramos al dashboard (cambia el texto)
      //  - error: salta un diálogo (que ya estamos capturando)
      // Así un fallo se reporta al instante en vez de agotar el timeout entero.
      await Promise.race([
        page.waitForFunction(
          () => /Registrar peso|Ranking|Ajustes|Dashboard/i.test(document.body.innerText),
          { timeout: 20_000 },
        ).catch(() => {}),
        page.waitForFunction(() => (window as any).__smokeDone === true, { timeout: 20_000 }).catch(() => {}),
        page.waitForTimeout(20_000),
      ]);

      const dialogText = dialogs.join(' | ');
      let bodyText = '';
      try {
        bodyText = await page.locator('body').innerText();
      } catch {
        bodyText = '';
      }
      const registered = !dialogText && /Registrar peso|Ranking|Ajustes|Dashboard/i.test(bodyText);

      expect(
        registered,
        `El registro NO completó.\n` +
          `Diálogo: ${dialogText || '(ninguno)'}\n` +
          `Errores consola: ${errors.slice(-3).join(' | ') || '(ninguno)'}\n` +
          `Diagnóstico: ${diagnose(dialogText || errors.slice(-3).join(' '))}`,
      ).toBe(true);

      // El icono del perfil NO puede cerrar la sesión de un solo toque: antes lo
      // hacía, y era un pie de banco (basta rozarlo para quedarte fuera).
      await page.getByRole('button', { name: /Tu perfil/i }).click();
      await expect(
        page.getByRole('dialog'),
        'Tocar el icono del perfil debe abrir una confirmación, no cerrar la sesión',
      ).toBeVisible();
      await expect(page.getByText(/¿Cerrar sesión\?/i)).toBeVisible();

      // Cancelar: seguimos dentro y con la sesión abierta.
      await page.getByRole('button', { name: /^Cancelar$/i }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(
        page.getByRole('button', { name: /Tu perfil/i }),
        'Cancelar debe dejarte dentro de la app',
      ).toBeVisible();

      // Confirmar: ahora sí se cierra, y volvemos a la pantalla de inicio.
      await page.getByRole('button', { name: /Tu perfil/i }).click();
      await page.getByRole('button', { name: /^Cerrar sesión$/i }).click();
      await expect(
        page.getByRole('button', { name: /Empezar el Reto/i }),
        'Tras confirmar deberíamos volver a la pantalla de inicio',
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      // Autolimpieza: sin esto, cada despliegue dejaría una cuenta de prueba
      // acumulada en el proyecto.
      await deleteTestAccount(email, password);
    }
  });

  test('S8 - al entrar (o recargar) se ve la pantalla de Inicio, no un hueco vacío', async ({ page }) => {
    // El bug: al recargar con la sesión abierta, la vista quedaba a medias y no
    // se pintaba nada hasta tocar una pestaña. El test entra, recarga, y exige
    // que el contenido aparezca SOLO, sin tocar ningún botón.
    const account = newTestAccount('inicio');
    const stamp = Date.now();

    try {
      await loadApp(page);
      await page.getByRole('button', { name: /Empezar el Reto/i }).click();
      await page.getByPlaceholder('Email').fill(account.email);
      await page.getByPlaceholder('Contraseña').fill(account.password);
      await page.getByPlaceholder(/nombre real/i).fill('Inicio Test');
      await page.getByPlaceholder(/Pseudónimo/i).fill(`inicio${String(stamp).slice(-5)}`);
      await page.getByPlaceholder(/Peso inicial/i).fill('77');
      await page.getByRole('button', { name: /Unirme al grupo/i }).click();

      await expect(page.getByRole('button', { name: /^Inicio$/i })).toBeVisible({ timeout: 20_000 });

      // Recargamos: es justo lo que hace la usuaria al volver a abrir la app.
      await page.reload({ waitUntil: 'domcontentloaded' });

      // Sin tocar nada: el panel tiene que estar ahí solo. Los textos son los
      // que realmente pinta el panel (comprobados en Dashboard.tsx): buscar uno
      // inventado hace fallar el test con la app funcionando perfectamente.
      await expect(
        page.getByText(/Coach IA|Logros Finales|Tu Historial Visual/i).first(),
        'Al recargar no se pintó la pantalla de Inicio: se quedó en blanco hasta tocar una pestaña',
      ).toBeVisible({ timeout: 25_000 });

      // Y la pestaña de Inicio debe estar marcada como activa.
      await expect(page.getByRole('button', { name: /^Inicio$/i })).toBeVisible();
    } finally {
      await deleteTestAccount(account.email, account.password);
    }
  });

  test('S9 - al entrar con una cuenta existente se ve el panel sin tocar nada', async ({ page }) => {
    // El bug de verdad: iniciar sesión con un usuario que YA existe dejaba la
    // app en blanco. `onAuthStateChanged` dispara un aviso con el usuario
    // momentáneamente a null; ese aviso reseteaba la vista a 'welcome', que no
    // pintaba nada, y ahí se quedaba. Solo se arreglaba pulsando una pestaña.
    const account = newTestAccount('entrar');
    const stamp = Date.now();

    try {
      // Registro (esto sí funcionaba) y después salgo, para entrar de nuevo.
      await loadApp(page);
      await page.getByRole('button', { name: /Empezar el Reto/i }).click();
      await page.getByPlaceholder('Email').fill(account.email);
      await page.getByPlaceholder('Contraseña').fill(account.password);
      await page.getByPlaceholder(/nombre real/i).fill('Entrar Test');
      await page.getByPlaceholder(/Pseudónimo/i).fill(`entrar${String(stamp).slice(-5)}`);
      await page.getByPlaceholder(/Peso inicial/i).fill('80');
      await page.getByRole('button', { name: /Unirme al grupo/i }).click();
      await expect(page.getByRole('button', { name: /^Inicio$/i })).toBeVisible({ timeout: 20_000 });

      // Cierro sesión usando la confirmación de la app.
      await page.getByRole('button', { name: 'Tu perfil' }).click();
      await page.getByRole('button', { name: /^Cerrar sesión$/ }).click();
      await expect(page.getByRole('button', { name: /Empezar el Reto/i })).toBeVisible({ timeout: 15_000 });

      // Y aquí está el caso que fallaba: entrar con una cuenta que ya existe.
      await page.getByRole('button', { name: /Ya tengo cuenta/i }).click();
      await page.getByPlaceholder('Email').fill(account.email);
      await page.getByPlaceholder('Contraseña').fill(account.password);
      await page.getByRole('button', { name: /^Entrar$/ }).click();

      // Sin tocar ninguna pestaña: el panel tiene que aparecer solo.
      await expect(
        page.getByText(/Coach IA|Logros Finales|Tu Historial Visual/i).first(),
        'Al entrar con una cuenta existente no se pintó nada: la app se quedó en blanco',
      ).toBeVisible({ timeout: 25_000 });
    } finally {
      await deleteTestAccount(account.email, account.password);
    }
  });

  test('S10 - la app publica su version y sabe cuando hay una nueva', async ({ request }) => {
    // Sin esto no es que la app se rompa: es que un cambio de version se queda
    // invisible y no se puede detectar. Es la pieza que evita la pantalla en
    // blanco por caché (GitHub Pages borra los assets del despliegue anterior),
    // así que conviene que falle fuerte si alguien la quita sin darse cuenta.
    const respuesta = await request.get(`${APP_URL}version.json`, { headers: { 'Cache-Control': 'no-cache' } });
    expect(respuesta.status(), 'Falta version.json: el aviso de version nueva no puede funcionar').toBe(200);

    const datos = await respuesta.json();
    expect(typeof datos.buildId, 'version.json no trae un buildId de texto').toBe('string');
    expect(datos.buildId.length, 'version.json trae un buildId vacío').toBeGreaterThan(0);
  });

  test('S4 - login con credenciales inexistentes da error controlado (no cuelga)', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });

    await loadApp(page);
    await page.getByRole('button', { name: /Ya tengo cuenta/i }).click();
    await expect(page.getByText(/Bienvenido de nuevo/i)).toBeVisible();

    await page.getByPlaceholder('Email').fill(`no.existe.${Date.now()}@example.com`);
    await page.getByPlaceholder('Contraseña').fill('Prueba12345!');
    await page.getByRole('button', { name: /Entrar|Acceder|Iniciar/i }).click();

    await page.waitForTimeout(9_000);
    expect(
      dialogs.length,
      'El login con credenciales malas no dio ningún error visible (se queda mudo)',
    ).toBeGreaterThan(0);
  });

  test('S5 - la app no se queda en spinner infinito', async ({ page }) => {
    await gotoApp(page);
    await page.waitForTimeout(8_000);

    const html = await page.locator('body').innerText();
    const spinners = await page.locator('.animate-spin').count();
    const spinnerOnly = /^\s*$/.test(html.trim()) && spinners > 0;

    expect(spinnerOnly, 'La app se quedó en spinner infinito (bloqueo por settings/competition)').toBe(false);
    await expect(page.getByText(/FitClub/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('S6 - no hay errores fatales en la consola al cargar', async ({ page }) => {
    const errors = await collectErrors(page);
    await loadApp(page);
    await page.waitForTimeout(4_000);

    const fatal = errors.filter(
      (e) => !/API key should be set/i.test(e) && !/React DevTools/i.test(e),
    );
    expect(fatal, `Errores en consola:\n${fatal.join('\n')}`).toHaveLength(0);
  });
});
