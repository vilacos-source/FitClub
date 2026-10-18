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
  updateDoc,
  writeBatch,
  type UpdateData,
} from 'firebase/firestore';
import { SIN_PESO_DE_PARTIDA, calcularPesaje, planDeReinicio } from '../../services/pesoDePartida';
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

  const app = initializeApp(config, 'prueba-admin');
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
      // Si la cuenta ya existe es que quedó de una ejecución anterior que no llegó
      // a borrarla. Se prueba a entrar con la contraseña de ESTA ejecución (no
      // puede coincidir), y si falla se para diciendo qué hay que hacer: no se
      // puede borrar desde aquí, porque hace falta la contraseña vieja.
      try {
        await signInWithEmailAndPassword(auth, EMAIL_ADMIN_PRUEBA, clave);
      } catch {
        throw new Error(
          `La cuenta de prueba ${EMAIL_ADMIN_PRUEBA} ya existe y no es de esta ejecución: ` +
            'quedó sin borrar de una vez anterior. Hay que borrarla a mano en ' +
            'Firebase → Authentication → Users (el email ES el rol, así que no debe quedar viva).',
        );
      }
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
    const plan = planDeReinicio();
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
    expect(
      pub.data()!.initialWeight,
      'El peso de partida debería haberse borrado (lo fija su primer pesaje)',
    ).toBe(SIN_PESO_DE_PARTIDA);

    // Y ahora lo que NO se toca: la persona sigue en el reto, igual que estaba.
    expect(pub.data()!.pseudonym, 'No debería cambiarle el pseudónimo').toBe('PruebaReinicio');
    expect(pub.data()!.avatar, 'No debería cambiarle la foto').toBe(
      'https://example.com/foto-de-prueba.png',
    );
    expect(pub.data()!.isAdmin, 'No debería cambiarlo de rol').toBe(false);
    expect(priv.data()!.realName, 'No debería borrarle el nombre real').toBe('Persona de prueba');

    // 5. Se borra lo de prueba y se comprueba AQUÍ, con la sesión todavía abierta:
    //    sin sesión, las reglas deniegan la lectura y daría un error de permisos
    //    que parecería del reinicio y no lo sería.
    for (const d of [docs.publico, docs.privado]) await deleteDoc(d);
    const [pubTrasBorrar, privTrasBorrar] = await Promise.all([
      getDoc(docs.publico),
      getDoc(docs.privado),
    ]);
    expect(
      pubTrasBorrar.exists(),
      'El participante de prueba debería haber quedado borrado',
    ).toBe(false);
    expect(
      privTrasBorrar.exists(),
      'Los datos privados de prueba deberían haber quedado borrados',
    ).toBe(false);
  } finally {
    // 6. Limpieza que tiene que pasar SIEMPRE, también si algo de arriba falla: los
    //    dos documentos y la cuenta de acceso. Va en el `finally` y no después,
    //    porque un fallo antes deja la cuenta viva — y una cuenta de prueba viva
    //    estorba a la siguiente ejecución (no se puede crear otra vez ni se conoce
    //    su contraseña).
    for (const d of [docs.publico, docs.privado]) {
      try {
        await deleteDoc(d);
      } catch {
        /* ya no estaba */
      }
    }
    try {
      if (auth.currentUser) await deleteUser(auth.currentUser);
    } catch {
      /* ya no estaba */
    }
  }
});

test('R5 - el primer pesaje fija el peso de partida, y después ya no se puede cambiar', async () => {
  test.skip(
    process.env.PROBAR_REINICIO !== 'si',
    'Escribe en la base de datos real: se lanza a propósito con PROBAR_REINICIO=si',
  );

  const app = initializeApp(config, 'prueba-miembro');
  const auth = getAuth(app);
  const db = getFirestore(app, config.firestoreDatabaseId);

  const clave = randomBytes(18).toString('base64url');
  // Dirección distinta en cada ejecución: así no puede chocar con la de una vez
  // anterior. (No hace falta que sea el correo de Elena: esta cuenta NO es
  // administradora, o sea que el email no le da ningún poder. Se borra al final.)
  const emailMiembro = `prueba-miembro-${randomBytes(5).toString('hex')}@example.com`;

  const cred = await createUserWithEmailAndPassword(auth, emailMiembro, clave);
  const ref = doc(db, 'leaderboard', cred.user.uid);

  try {
    // 1. Cómo queda una persona tras «empezar de cero»: sin peso de partida.
    await setDoc(ref, {
      pseudonym: 'PruebaMiembro',
      avatar: 'https://example.com/foto-de-prueba.png',
      initialWeight: SIN_PESO_DE_PARTIDA,
      totalPoints: 0,
      totalWeightLoss: 0,
      isAdmin: false,
    });
    expect(
      (await getDoc(ref)).data()!.initialWeight,
      'Debería poder guardarse «sin peso de partida» (es como queda tras el reinicio)',
    ).toBe(SIN_PESO_DE_PARTIDA);

    // 2. Su PRIMER pesaje: lo fija él, y los kilos perdidos siguen a cero.
    const calculo = calcularPesaje(
      { initialWeight: SIN_PESO_DE_PARTIDA, totalWeightLoss: 0, history: [] },
      82.4,
    );
    expect(calculo.fijaElPesoDePartida, 'El primer pesaje debería fijar el peso de partida').toBe(
      true,
    );
    await updateDoc(ref, { initialWeight: 82.4, totalPoints: 15, totalWeightLoss: 0 });
    expect((await getDoc(ref)).data()!.initialWeight).toBe(82.4);

    // 3. Y ahora lo que de verdad protege el juego: ya NO lo puede cambiar. Si esto
    //    pasara, cualquiera podría reescribir su peso de salida el día que le
    //    conviniera y los kilos perdidos dejarían de significar nada.
    await expect(
      updateDoc(ref, { initialWeight: 100, totalPoints: 15, totalWeightLoss: 0 }),
      'Cambiar el peso de partida ya fijado debería estar PROHIBIDO',
    ).rejects.toThrow();
    expect(
      (await getDoc(ref)).data()!.initialWeight,
      'El peso de partida no debería haber cambiado',
    ).toBe(82.4);

    // 4. Se borra lo de prueba y se comprueba AQUÍ, con la sesión todavía abierta
    //    (sin sesión, las reglas deniegan la lectura y daría un error de permisos
    //    que no tiene nada que ver).
    await deleteDoc(ref);
    expect(
      (await getDoc(ref)).exists(),
      'El perfil de prueba debería haber quedado borrado',
    ).toBe(false);
  } finally {
    // La limpieza que tiene que pasar SIEMPRE, también si algo falla: el documento
    // y la cuenta de acceso. En el `finally` y no después, porque un fallo antes
    // dejaría la cuenta viva.
    try {
      await deleteDoc(ref);
    } catch {
      /* ya no estaba */
    }
    try {
      if (auth.currentUser) await deleteUser(auth.currentUser);
    } catch {
      /* ya no estaba */
    }
  }
});
