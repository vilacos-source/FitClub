import { test, expect } from '@playwright/test';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, Auth } from 'firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  Firestore,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Test de regresión de PRIVACIDAD (no necesita navegador: habla directamente
 * con Firestore usando el SDK, igual que la app).
 *
 * Protege el invariante: los datos personales (nombre real e historial de
 * pesajes) NUNCA pueden estar en un documento de lectura pública.
 *
 * Contexto: esto ya se rompió una vez. El nombre real vivía en la misma
 * colección que el ranking, y como Firestore no puede ocultar campos en una
 * consulta, cualquier usuario registrado podía descargarse el nombre real y los
 * pesos de todo el grupo. Ver TESTING.md (INC-007).
 */

const cfg = JSON.parse(
  readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'),
) as Record<string, string>;

const PUBLIC_COLLECTION = 'leaderboard';
const PRIVATE_COLLECTION = 'users';

/** Comprueba que una operación queda DENEGADA por las reglas. */
async function expectDenied(promise: Promise<unknown>, what: string) {
  let error: unknown = null;
  try {
    await promise;
  } catch (e) {
    error = e;
  }
  expect(
    error,
    `${what}: las reglas lo PERMITIERON, pero debería estar prohibido`,
  ).not.toBeNull();
  const code = String((error as { code?: string })?.code ?? (error as Error)?.message ?? '');
  expect(code, `${what}: se esperaba permission-denied, llegó "${code}"`).toContain(
    'permission-denied',
  );
}

test.describe('Privacidad de datos personales', () => {
  let app: FirebaseApp;
  let auth: Auth;
  let db: Firestore;
  let myUid: string;

  test.beforeAll(async () => {
    app = initializeApp(cfg, `privacy-${Date.now()}`);
    auth = getAuth(app);
    db = getFirestore(app, cfg.firestoreDatabaseId);

    // Cuenta nueva y SIN privilegios de admin: así ve el sistema cualquier
    // persona que se registre por su cuenta.
    const cred = await createUserWithEmailAndPassword(
      auth,
      `privacy${Date.now()}@example.com`,
      'Prueba12345!',
    );
    myUid = cred.user.uid;
  });

  test.afterAll(async () => {
    try {
      await signOut(auth);
    } catch {
      /* da igual */
    }
    await deleteApp(app);
  });

  test('S7a - el ranking se puede leer pero no contiene datos personales', async () => {
    const snap = await getDocs(collection(db, PUBLIC_COLLECTION));
    snap.forEach((d) => {
      const data = d.data();
      expect(
        Object.keys(data),
        `El documento público ${d.id} contiene "realName"`,
      ).not.toContain('realName');
      expect(
        Object.keys(data),
        `El documento público ${d.id} contiene "history"`,
      ).not.toContain('history');
    });
  });

  test('S7b - un usuario normal NO puede listar la colección privada', async () => {
    await expectDenied(
      getDocs(collection(db, PRIVATE_COLLECTION)),
      'Listar la colección privada de usuarios',
    );
  });

  test('S7c - un usuario normal NO puede leer el documento privado de otro', async () => {
    await expectDenied(
      getDoc(doc(db, PRIVATE_COLLECTION, 'otro-usuario-que-no-soy-yo')),
      'Leer el documento privado de otro usuario',
    );
  });

  test('S7d - cada usuario sí puede leer y escribir SUS datos privados', async () => {
    await setDoc(doc(db, PRIVATE_COLLECTION, myUid), {
      realName: 'Nombre Privado De Prueba',
      history: [],
    });
    const snap = await getDoc(doc(db, PRIVATE_COLLECTION, myUid));
    expect(snap.exists(), 'El dueño debería poder leer su propio documento').toBe(true);
    expect(snap.data()?.realName).toBe('Nombre Privado De Prueba');
  });

  test('S7e - nadie puede auto-ascenderse a administrador', async () => {
    await expectDenied(
      setDoc(doc(db, PUBLIC_COLLECTION, myUid), {
        pseudonym: 'intruso',
        avatar: 'https://ejemplo.com/a.png',
        initialWeight: 80,
        totalPoints: 0,
        totalWeightLoss: 0,
        isAdmin: true,
      }),
      'Crear un perfil propio marcándose como admin',
    );
  });

  test('S7f - un usuario normal no puede escribir la configuración del reto', async () => {
    await expectDenied(
      setDoc(doc(db, 'settings', 'competition'), {
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        prizeDescription: 'premio pirata',
      }),
      'Escribir la configuración del reto',
    );
  });
});
