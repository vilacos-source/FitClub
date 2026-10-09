# FitClub — Registro de incidencias y feedback

Documento vivo. Cada prueba que hacemos deja aquí una ficha: qué se probó, qué
falló, la causa raíz y si está resuelto. Sirve para ir trazando el feedback y
mejorar conjuntamente.

**Leyenda de estado:** 🔴 abierto · 🟡 en curso · 🟢 resuelto

---

## Incidencias

### INC-001 — La página salía en blanco (assets 404) 🔴→🟢
- **Síntoma:** al publicar en GitHub Pages, la web cargaba pero sin nada (pantalla blanca).
- **Causa:** Vite compilaba con `base: '/'`, así que los assets se pedían a
  `/assets/...` (raíz del dominio) en vez de `/FitClub/assets/...`. GitHub Pages
  servía 404 en los assets y React no montaba.
- **Solución:** `base` configurable por `VITE_BASE_PATH`, fijado a `/FitClub/`
  en el workflow de despliegue.
- **Cubierto por:** smoke test **S1**.

### INC-002 — El registro de usuario falla 🟢 RESUELTO
- **Síntoma:** al pulsar "¡Unirme al grupo!" aparece
  `Error: Firebase: Error (auth/operation-not-allowed).`
- **Reproducido:** sí, en la web publicada y por API REST
  (`OPERATION_NOT_ALLOWED`).
- **Causa raíz:** el proveedor **Email/Password no estaba añadido** al
  proyecto Firebase `gen-lang-client-0504040822` (solo tenía Google).
- **Solución aplicada:** Firebase Console → Authentication → Método de acceso →
  **Agregar proveedor nuevo → Correo electrónico/contraseña → Habilitar**.
- **Verificado:** el error pasó de `OPERATION_NOT_ALLOWED` a
  `INVALID_LOGIN_CREDENTIALS` (el esperado para un usuario inexistente), y el
  smoke test S3 pasa.
- **Cubierto por:** smoke test **S3**.

### INC-003 — Dominio no autorizado 🟢 RESUELTO
- **Síntoma previsto:** tras arreglar INC-002, el registro fallará con
  `auth/unauthorized-domain`.
- **Causa raíz:** `vilacos-source.github.io` no estaba en la lista de dominios
  autorizados del proyecto Firebase.
- **Solución aplicada:** Firebase Console → Authentication → Configuración →
  Authorized domains → agregar `vilacos-source.github.io`.
- **Verificado:** confirmado por API (`authorizedDomains` ya lo incluye).
- **Cubierto por:** smoke test **S3**.

### INC-004 — El admin nunca se creaba 🟢
- **Síntoma:** ninguna cuenta obtenía permisos de administrador.
- **Causa raíz (doble):**
  1. En `App.tsx`, `isAdmin: users.length === 0` — `users` solo se rellena para
     usuarios ya logueados, así que esa condición no se cumplía nunca.
  2. Las reglas de Firestore exigían ser admin para poder crear un usuario con
     `isAdmin: true` → escalada imposible por diseño.
- **Solución:** el rol se decide por una lista de emails (`ADMIN_EMAILS` en
  `App.tsx` y `adminEmails()` en `firestore.rules`, ambas con
  `vilacos@gmail.com`). Mantener ambas listas sincronizadas.
- **Nota:** para cambiar admins hay que editar los dos sitios y redesplegar.

### INC-005 — Riesgo de spinner infinito 🟢
- **Síntoma potencial:** si `settings/competition` no existe o falla su lectura,
  `App.tsx` bloqueaba TODA la app en un spinner (`if (!currentUser || !competitionConfig)`);
  un error de lectura además lanzaba una excepción desde el handler del snapshot.
- **Solución:** ante error o documento ausente se usa una configuración por
  defecto local y la app sigue funcionando; el diagnóstico queda en consola.
- **Cubierto por:** smoke test **S5**.

### INC-006 — Aviso de Gemini sin clave 🟡
- **Síntoma:** en consola aparece `API key should be set when using the Gemini API.`
- **Causa:** `vite.config.ts` inyecta `GEMINI_API_KEY`, que no existe en el
  despliegue (el workflow la lee de `secrets.GEMINI_API_KEY`, que no está creado).
- **Impacto:** ninguno en el camino crítico actual (la app no usa Gemini en
  registro/login/peso), pero cualquier función de IA fallará en silencio.
- **Acción posible:** crear el secret `GEMINI_API_KEY` en GitHub, o retirar el
  servicio Gemini si no se va a usar.
- **Cubierto por:** smoke test **S6** (filtra este aviso como no fatal).

---

## Batería de smoke tests

Corre automáticamente en **cada despliegue** (job `smoke-tests` del workflow,
después de publicar) contra la web real. También en local:

```bash
npm run test:smoke          # contra la web publicada
npm run test:smoke:local    # contra http://localhost:4173 (tras npm run preview)
```

| Test | Qué verifica | Estado |
|------|--------------|--------|
| S1 | La app carga y monta el landing (no página en blanco) | ✅ pasa |
| S2 | El formulario de registro se abre con todos sus campos | ✅ pasa |
| S3 | El registro de un usuario nuevo funciona de verdad | ✅ pasa |
| S4 | El login con credenciales malas da error controlado | ✅ pasa |
| S5 | La app no se queda en spinner infinito | ✅ pasa |
| S6 | No hay errores fatales en consola al cargar | ✅ pasa |

El informe de cada ejecución queda como artefacto `smoke-test-report` en la
pestaña **Actions** del repositorio (30 días de retención).

### Trampas ya encontradas al escribir la batería (no repetirlas)
1. **No usar `waitUntil: 'networkidle'`**: Firestore mantiene un stream abierto
   y la navegación nunca se considera "idle" → el test cuelga.
2. **Usar la URL completa, no `page.goto('/')`**: Playwright resuelve `'/'`
   contra el origen del `baseURL` e ignora el subpath; en `/FitClub/` acaba en el
   dominio raíz y devuelve un 404 de GitHub Pages.
3. **Forzar IPv4**: este entorno resuelve `vilacos-source.github.io` solo por
   IPv6 y no tiene ruta IPv6; Chromium falla y sirve un 404 de GitHub Pages.
   La config fija `--host-resolver-rules` a las IPs IPv4 de GitHub Pages.
