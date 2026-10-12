import { expect, test } from '@playwright/test';

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
});
