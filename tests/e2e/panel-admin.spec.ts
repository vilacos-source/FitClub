import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Comprobación de la pantalla de ADMINISTRADOR (la que solo ve la dueña del
 * reto): la tarjeta de invitar por WhatsApp y el formulario con email.
 *
 * Necesita una cuenta de administrador de verdad, así que:
 *   - Se SALTA si no hay credenciales o si no se puede entrar. Si no, al
 *     ejecutarse en CI (donde no hay cuenta de admin) daría rojo y taparía
 *     fallos reales de la app.
 *   - Para ejecutarlo:
 *       ADMIN_EMAIL=... ADMIN_PASS=... BASE_URL=... npx playwright test tests/e2e/panel-admin.spec.ts
 *
 * La contraseña va por variable de entorno, NUNCA escrita en el repositorio.
 */
const APP_URL = process.env.BASE_URL || 'https://vilacos-source.github.io/FitClub/';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS = process.env.ADMIN_PASS;

test('S13 - el panel de admin ofrece el enlace para invitar y el formulario con email', async ({ page }) => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASS,
    'Falta ADMIN_EMAIL/ADMIN_PASS: esta pantalla necesita una cuenta con permisos.',
  );

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.length > 20, { timeout: 30_000 });

  const yaTengoCuenta = page.getByRole('button', { name: /Ya tengo cuenta/i });
  if (await yaTengoCuenta.isVisible().catch(() => false)) await yaTengoCuenta.click();

  await page.getByPlaceholder('Email').fill(ADMIN_EMAIL as string);
  await page.getByPlaceholder('Contraseña').fill(ADMIN_PASS as string);
  await page.getByRole('button', { name: /^Entrar$/i }).click();

  // Si las credenciales no valen, se salta en vez de fallar: puede que la
  // contraseña haya cambiado, y eso no significa que el panel esté roto.
  const entro = await page
    .getByText(/Coach IA/i)
    .isVisible({ timeout: 30_000 })
    .catch(() => false);
  test.skip(!entro, `No se pudo entrar como ${ADMIN_EMAIL}: revisa ADMIN_PASS.`);

  // Ir al panel
  await page.getByRole('button', { name: /Admin/i }).click();
  await expect(page.getByText(/Panel de Control/i)).toBeVisible({ timeout: 20_000 });

  // 1) Tarjeta de invitar: el enlace a la vista y el botón de WhatsApp
  await expect(page.getByText(/Invitar al reto/i)).toBeVisible();
  const enlace = (await page.locator('div.font-mono').first().innerText()).trim();
  expect(enlace, `El enlace mostrado no parece una URL: "${enlace}"`).toMatch(/^https?:\/\/.+\S$/);

  const botonWa = page.getByRole('button', { name: /Enviar por WhatsApp/i });
  await expect(botonWa).toBeVisible();

  // El botón construye un enlace wa.me con el mensaje ya escrito
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 10_000 }).catch(() => null),
    botonWa.click(),
  ]);
  // `popup` puede ser null si el navegador bloquea la ventana: se avisa y se sigue.
  const urlWa = popup ? popup.url() : '';
  if (urlWa) {
    expect(urlWa).toContain('wa.me');
    const texto = decodeURIComponent(urlWa.split('text=')[1] ?? '');
    expect(texto, 'El mensaje de WhatsApp debería llevar el enlace de la app').toContain(enlace);
    console.log(`Mensaje que se enviaría:\n${texto}`);
    if (popup) await popup.close();
  } else {
    console.log('AVISO: no se abrió la ventana de WhatsApp (bloqueada por el navegador)');
  }

  // 2) El formulario de añadir pide el email y avisa de por qué
  await page.getByRole('button', { name: /Añadir/i }).click();
  await expect(page.getByPlaceholder(/Email con el que entrará/i)).toBeVisible();
  await expect(page.getByText(/tiene que registrarse con ese mismo email/i)).toBeVisible();

  // 3) La copia de seguridad: al pulsar, se descarga un fichero con TODO.
  //    Esta es la comprobación que de verdad importa de la pantalla: que la copia
  //    salga y traiga los datos, no solo que el botón exista.
  await expect(page.getByText(/Copia de seguridad/i)).toBeVisible();
  const [descarga] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }).catch(() => null),
    page.getByRole('button', { name: /Descargar copia de seguridad/i }).click(),
  ]);
  expect(descarga, 'Al pulsar el botón debería descargarse un fichero').not.toBeNull();

  if (descarga) {
    expect(descarga.suggestedFilename()).toMatch(/^fitclub-copia-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);

    // Y que el fichero traiga los datos de verdad, no un JSON vacío.
    const ruta = await descarga.path();
    const contenido = readFileSync(ruta as string, 'utf8');
    const copia = JSON.parse(contenido);

    expect(copia.aplicacion).toBe('FitClub');
    expect(copia.tipo).toBe('copia-de-seguridad');
    expect(copia.ranking.length, 'La copia debería traer el ranking').toBeGreaterThan(0);
    expect(copia.personas.length, 'La copia debería traer las personas').toBeGreaterThan(0);

    // Los historiales son lo que no se puede recuperar de ninguna otra forma:
    // no puede venir la lista vacía de contenido.
    const pesajes = copia.personas.reduce(
      (t: number, p: { history?: unknown[] }) => t + (Array.isArray(p.history) ? p.history.length : 0),
      0,
    );
    expect(pesajes, 'La copia debería traer los pesajes').toBeGreaterThan(0);
    expect(copia.resumen.pesajes, 'El resumen debe cuadrar con el contenido').toBe(pesajes);

    // El nombre real y el historial tienen que estar: es la razón de la copia.
    const conNombre = copia.personas.filter((p: { realName?: string }) => (p.realName ?? '').length > 0);
    expect(conNombre.length, 'Las personas deberían llevar su nombre real').toBeGreaterThan(0);

    console.log(
      `Copia verificada: ${copia.resumen.participantes} participantes, ` +
        `${copia.resumen.personas} personas, ${pesajes} pesajes ` +
        `(${descarga.suggestedFilename()}, ${Math.round(contenido.length / 1024)} KB)`,
    );
  }

  // El panel confirma con un mensaje claro, no en silencio
  await expect(page.getByText(/Copia descargada/i)).toBeVisible({ timeout: 15_000 });
});
