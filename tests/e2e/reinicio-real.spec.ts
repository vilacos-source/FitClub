import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  writeBatch,
  type UpdateData,
} from 'firebase/firestore';
import { planDeReinicio } from '../../services/resetMember';
import type { PrivateData, PublicProfile } from '../../types';

/**
 * Prueba REAL de "empezar de cero", contra la base de datos del reto.
 *
 * POR QUÉ EXISTE: los otros tests comprueban que la lógica decide bien y que la
 * pantalla está conectada, pero ninguno responde a la pregunta que de verdad
 * importa: ¿las reglas publicadas DEJAN a un administrador borrar los datos de
 * otra persona? Eso solo se sabe HACIENDO la petición. Y de las reglas depende
 * todo: si dicen que no, el botón parecería funcionar y no borraría nada.
 *
 * CÓMO FUNCIONA: se crea su propia cuenta de administradora de prueba (el email
 * ES el rol, así que basta con esa dirección), apunta un participante de prueba
 * con pesajes y puntos, le hace el reinicio EXACTAMENTE como lo hace la app (los
 * dos documentos en un solo lote) y lee de vuelta. Al terminar borra sus
 * documentos y su cuenta: no deja rastro y NO toca a nadie del grupo.
 *
 * NO se ejecuta sola: escribe en la base de datos de verdad. Solo cuando se pide
 * a propósito:
 *
 *     PROBAR_REINICIO=si npx playwright test tests/e2e/reinicio-real.spec.ts
 *
 * La contraseña de la cuenta de prueba se genera aquí y no se imprime nunca.
 */

const config = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));

/** Cuenta de administradora desechable. Es una variante del correo de Elena: solo ella puede reclamarla. */
const EMAIL_ADMIN_PRUEBA = 'vilacos+prueba@gmail.com';

test('R4 - un administrador puede de verdad poner a cero a un participante', async () => {
  test.skip(
    process.env.PROBAR_REINICIO !== 'si',
    'Escribe en la base de datos real: se lanza a propósito con PROBAR_REINICIO=si',
  );

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app, config.firestoreDatabaseId);

  const clave = randomBytes(18).toString('base64url');
  const idMiembro = `prueba-reinicio-${randomBytes(4).toString('hex')}`;
  const docs = {
    publico: doc(db, 'leaderboard', idMiembro),
    privado: doc(db, 'users', idMiembro),
  };

  try {
    // 1. Entrar como administradora. `vilacos+prueba` está en la lista de las
    //    reglas, así que con ese email ya se tienen los permisos.
    try {
      await createUserWithEmailAndPassword(auth, EMAIL_ADMIN_PRUEBA, clave);
    } catch {
      // Si quedó de una vez anterior, se entra con la misma contraseña (la de
      // esta ejecución se acaba de generar, así que si falla es que la cuenta es
      // de otra ejecución: mejor parar y decirlo que seguir a ciegas).
      await signInWithEmailAndPassword(auth, EMAIL_ADMIN_PRUEBA, clave);
    }
    expect(auth.currentUser?.email, 'Deberíamos estar dentro como administradora').toBe(
      EMAIL_ADMIN_PRUEBA,
    );

    // 2. Un participante de prueba, con pesajes y puntos, como uno de verdad.
    await setDoc(docs.publico, {
      pseudonym: 'PruebaReinicio',
      avatar: 'https://example.com/foto-de-prueba.png',
      initialWeight: 90,
      totalPoints: 350,
      totalWeightLoss: 4.2,
      isAdmin: false,
    } satisfies Omit<PublicProfile, 'id'>);

    const pesajes = [
      { id: 'a', date: '2026-09-01', weight: 89, delta: -1, points: 110, ateOut: false },
      { id: 'b', date: '2026-09-08', weight: 87, delta: -2, points: 210, ateOut: true },
      { id: 'c', date: '2026-09-15', weight: 85.8, delta: -1.2, points: 30, ateOut: false },
    ];
    await setDoc(docs.privado, {
      realName: 'Persona de prueba',
      history: pesajes,
    } satisfies PrivateData);

    // 3. El reinicio, EXACTAMENTE como lo hace la app: los dos documentos en un
    //    solo lote, que se aplica entero o no se aplica.
    const plan = planDeReinicio(85.8);
    const lote = writeBatch(db);
    lote.update(docs.privado, plan.privado as UpdateData<PrivateData>);
    lote.update(docs.publico, plan.publico as UpdateData<Omit<PublicProfile, 'id'>>);
    await lote.commit();

    // 4. Leer de vuelta. Primero: se ha borrado lo que tenía que borrarse.
    const [pub, priv] = await Promise.all([getDoc(docs.publico), getDoc(docs.privado)]);
    expect(priv.data(), 'El documento privado debería seguir existiendo').not.toBeNull();
    expect(priv.data()!.history, 'Los pesajes deberían haberse borrado').toEqual([]);
    expect(pub.data()!.totalPoints, 'Los puntos deberían estar a cero').toBe(0);
    expect(pub.data()!.totalWeightLoss, 'Los kilos perdidos deberían estar a cero').toBe(0);
    expect(pub.data()!.initialWeight, 'Debería partir del peso nuevo').toBe(85.8);

    // Y ahora lo que NO se toca: la persona sigue en el reto, igual que estaba.
    expect(pub.data()!.pseudonym, 'No debería cambiarle el pseudónimo').toBe('PruebaReinicio');
    expect(pub.data()!.avatar, 'No debería cambiarle la foto').toBe(
      'https://example.com/foto-de-prueba.png',
    );
    expect(pub.data()!.isAdmin, 'No debería cambiarlo de rol').toBe(false);
    expect(priv.data()!.realName, 'No debería borrarle el nombre real').toBe('Persona de prueba');
  } finally {
    // 5. Limpieza, pase lo que pase: los dos documentos de prueba.
    for (const d of [docs.publico, docs.privado]) {
      try {
        await deleteDoc(d);
      } catch {
        /* ya no estaba */
      }
    }
  }

  // 5b. La limpieza se comprueba AHORA, leyendo después de borrar y TODAVÍA con
  // la sesión de administradora abierta. El orden importa: si se cerrara la
  // sesión antes de comprobar, estas lecturas irían sin identificar y las
  // reglas las denegarían, dando un error de permisos que parece del reinicio y
  // no lo es.
  const [pub, priv] = await Promise.all([getDoc(docs.publico), getDoc(docs.privado)]);
  expect(pub.exists(), 'El participante de prueba debería haber quedado borrado').toBe(false);
  expect(priv.exists(), 'Los datos privados de prueba deberían haber quedado borrados').toBe(false);

  // 6. Y ya sí, se cierra la cuenta de acceso de prueba.
  if (auth.currentUser) await deleteUser(auth.currentUser);
  expect(
    auth.currentUser,
    'La cuenta de administradora de prueba no debería quedar abierta',
  ).toBeNull();
});
