import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, deleteUser, signOut } from 'firebase/auth';
import { getFirestore, doc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
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

/**
 * Rellena un historial de pesajes DENTRO del periodo del reto en curso.
 *
 * Los tests crean la cuenta por el camino real (el formulario), pero un
 * historial de cinco pesajes tardaría cinco días en acumularse. Y hay que
 * sembrarlo dentro del periodo: el gráfico dibuja el reto completo (un hueco por
 * día), así que un pesaje de fuera del periodo no aparecería y el test estaría
 * midiendo otra cosa. Por eso primero se lee `settings/competition`.
 *
 * Devuelve cuántos pesajes escribió, o 0 si no pudo.
 */
export async function seedHistoryInChallenge(
  email: string,
  password: string,
  cuantos: number,
): Promise<number> {
  const app = initializeApp(
    cfg,
    `seed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const auth = getAuth(app);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  /** Suma días a una fecha YYYY-MM-DD sin líos de zona horaria. */
  const sumarDias = (fecha: string, n: number) => {
    const [y, m, d] = fecha.split('-').map(Number);
    const base = new Date(y, m - 1, d + n);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
  };

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);

    const snap = await getDoc(doc(db, 'settings', 'competition'));
    const conf = snap.exists() ? (snap.data() as { startDate?: string }) : null;
    const inicio = conf?.startDate;
    if (!inicio) {
      console.warn('[siembra] No se pudo leer el inicio del reto; no se siembra.');
      return 0;
    }

    const pesos = [84.2, 83.6, 83.1, 82.9, 82.1];
    const history = pesos.slice(0, cuantos).map((w, i) => ({
      id: `seed-${i}`,
      date: sumarDias(inicio, i), // los primeros días del reto, seguro dentro
      weight: w,
      delta: i === 0 ? -(85 - w) : -(pesos[i - 1] - w),
      points: 10 + i * 5,
      ateOut: false,
    }));

    await setDoc(doc(db, PRIVATE_COLLECTION, cred.user.uid), { history }, { merge: true });
    return history.length;
  } catch (error) {
    console.warn(
      `[siembra] No se pudo escribir el historial de ${email}:`,
      (error as Error)?.message ?? error,
    );
    return 0;
  } finally {
    try {
      await signOut(auth);
    } catch {
      /* da igual: cerramos la app igualmente */
    }
    await deleteApp(app);
  }
}
