import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, deleteUser, signOut } from 'firebase/auth';
import { getFirestore, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Autolimpieza de las cuentas que crean los tests.
 *
 * Los smoke tests registran usuarios de verdad (es la única forma de comprobar
 * que el alta funciona). Sin esto, cada despliegue dejaría una cuenta de prueba
 * en el proyecto, y con el tiempo el ranking y Authentication se llenarían de
 * basura.
 *
 * Borra las tres cosas, en este orden:
 *  1. `users/{uid}`       → datos privados
 *  2. `leaderboard/{uid}` → datos públicos
 *  3. la cuenta de Authentication
 *
 * Las reglas permiten al dueño borrar sus propios documentos (ver
 * firestore.rules), así que no hace falta ser administrador.
 */

const cfg = JSON.parse(
  readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'),
) as Record<string, string>;

const PUBLIC_COLLECTION = 'leaderboard';
const PRIVATE_COLLECTION = 'users';

/**
 * Borra la cuenta de prueba y todos sus datos.
 * No lanza: si la limpieza falla, avisa y devuelve null. El test que la llama ya
 * habrá comprobado lo que tenía que comprobar, y no queremos enmascarar ese
 * resultado con un fallo de limpieza.
 */
export async function deleteTestAccount(
  email: string,
  password: string,
): Promise<string | null> {
  const app = initializeApp(
    cfg,
    `cleanup-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;

    await deleteDoc(doc(db, PRIVATE_COLLECTION, uid));
    await deleteDoc(doc(db, PUBLIC_COLLECTION, uid));
    await deleteUser(cred.user);

    return uid;
  } catch (error) {
    console.warn(
      `[limpieza] No se pudo borrar la cuenta de prueba ${email}:`,
      (error as Error)?.message ?? error,
    );
    return null;
  } finally {
    try {
      await signOut(auth);
    } catch {
      /* la cuenta ya no existe: es lo normal tras borrarla */
    }
    await deleteApp(app);
  }
}

/** Datos de una cuenta de prueba recién creada por un test. */
export interface TestAccount {
  email: string;
  password: string;
}

/** Crea un identificador de cuenta único para una ejecución de test. */
export function newTestAccount(prefix: string): TestAccount {
  return {
    email: `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`,
    password: 'Prueba12345!',
  };
}

/** Un pesaje para sembrar. */
export interface SeedWeighIn {
  date: string; // YYYY-MM-DD
  weight: number;
  delta: number;
  points: number;
}

/**
 * Escribe un historial de pesajes en el documento privado de una cuenta.
 *
 * Los tests crean la cuenta por el camino real (el formulario), pero hay cosas
 * que en la vida real tardarían días en acumularse — un historial de cinco
 * pesajes, por ejemplo — y no se puede esperar. Esto rellena el dato para poder
 * comprobar cómo se dibuja. `merge` conserva el nombre real que escribió el alta.
 */
export async function seedHistory(
  email: string,
  password: string,
  entries: SeedWeighIn[],
): Promise<boolean> {
  const app = initializeApp(
    cfg,
    `seed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const history = entries.map((e, i) => ({ id: `seed-${i}`, ateOut: false, ...e }));
    await setDoc(doc(db, PRIVATE_COLLECTION, cred.user.uid), { history }, { merge: true });
    return true;
  } catch (error) {
    console.warn(
      `[siembra] No se pudo escribir el historial de ${email}:`,
      (error as Error)?.message ?? error,
    );
    return false;
  } finally {
    try {
      await signOut(auth);
    } catch {
      /* da igual: cerramos la app igualmente */
    }
    await deleteApp(app);
  }
}
