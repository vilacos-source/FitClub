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

### INC-007 — Cualquier usuario podía leer los nombres reales y los pesos de todos ✅ resuelto
- **Síntoma:** una cuenta recién creada, sin perfil y sin permisos, podía descargar
  el nombre real, el peso inicial y el historial de pesajes de todo el grupo.
- **Reproducido:** sí, con el SDK real de Firestore (ver `tests/e2e/privacy.spec.ts`).
- **Causa raíz:** los datos personales vivían en la misma colección (`users`) que
  alimentaba el ranking, con `allow list: if isSignedIn()`. Firestore **no puede
  ocultar campos en una consulta**: si el documento es legible, lo son todos sus
  campos. El `if (isAdmin)` de `Leaderboard.tsx` era solo un candado visual.
  Contradecía el propio `security_spec.md` (payload #11, "PII Leak").
- **Solución:** separar en dos colecciones según sensibilidad:
  - `leaderboard/{uid}` → datos públicos (pseudónimo, avatar, puntos, kg). Lo lee
    cualquier usuario con sesión.
  - `users/{uid}` → datos privados (nombre real, historial). Solo su dueño y admins.
  El admin obtiene los nombres reales aparte, leyendo la colección privada.
- **Cubierto por:** smoke tests **S7a–S7f**.

### INC-008 — La web publicada se quedaba en blanco (faltaba la clave de Gemini) ✅ resuelto
- **Síntoma:** la página cargaba pero no se veía nada: ni landing, ni texto, ni error.
  El HTML llegaba bien (200) y el JS también (200), pero React no montaba.
- **Reproducido:** sí. Importando el bundle desplegado a mano salía el error real:
  `Error: An API Key must be set when running in a browser`.
- **Causa raíz:** `services/geminiService.ts` creaba el cliente en el **nivel del
  módulo**: `const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })`.
  En CI, `GEMINI_API_KEY` no está configurada, así que el `define` de Vite la
  sustituye por `undefined`; el constructor lanza, el módulo no llega a
  evaluarse y se cae todo el árbol de imports que cuelga de él.
  Un adorno (los mensajes motivacionales) tumbaba la aplicación entera.
- **Solución:** inicialización **perezosa** y tolerante a fallos. Si no hay clave
  o falla la creación del cliente, se avisa por consola y se usan los mensajes
  por defecto; la app arranca igual.
- **Cubierto por:** smoke test **S1** (la app carga y renderiza, no página en blanco).
- **Lección:** nunca crear clientes de servicios externos en el nivel del módulo
  de algo que importa la app; hacerlo dentro de la función y envuelto en try/catch.

### INC-009 — Tocar el icono del perfil cerraba la sesión sin avisar ✅ resuelto
- **Síntoma:** un toque en el avatar de la barra superior te sacaba de la app al
  instante. Sin confirmación y sin querer: basta rozarlo.
- **Reproducido:** sí, leyendo el componente: `components/TopNav.tsx` llamaba a
  `onLogout` directamente en el `onClick` del avatar.
- **Causa raíz:** el botón no distinguía «abrir mi perfil» de «cerrar sesión», y
  cerrar sesión es destructivo (hay que volver a entrar con email y contraseña).
- **Solución:** confirmación propia de la app (no un `confirm()` del navegador):
  `role="dialog"`, con «Cancelar» y «Cerrar sesión». Tocar fuera también cancela.
  De paso, el botón tenía **nombre accesible vacío** (la imagen con `alt=""`), así
  que no era ni localizable por un test ni anunciado por un lector de pantalla;
  ahora lleva `aria-label="Tu perfil"`.
- **Cubierto por:** smoke test **S3** (abre la confirmación, «Cancelar» te deja
  dentro, y solo al confirmar se cierra la sesión).

### INC-010 — Al abrir la app no se veía nada hasta tocar una pestaña ✅ resuelto
- **Síntoma:** al entrar con la sesión ya abierta, la pantalla aparecía **vacía**:
  se veía la barra inferior, pero el contenido no. Hasta que pulsabas Inicio,
  Ranking o Reglas no aparecía nada.
- **Reproducido:** sí. Registrando una cuenta y recargando la página:
  `document.querySelector('main').innerText.length === 0` con el código viejo.
- **Causa raíz:** la vista inicial era `'dashboard'`… pero el efecto que deja la
  sesión cerrada la pisaba con `'welcome'`. `'welcome'` es un valor válido del
  tipo, así que **el compilador no lo detecta**, y al no haber ningún bloque que
  pinte esa vista, el `<main>` se quedaba vacío. Solo se arreglaba al pulsar una
  pestaña, que ya asignaba un valor pintable.
- **Solución:** la vista inicial es **`'dashboard'` siempre**, y la pestaña elegida
  se recuerda en `sessionStorage` para que recargar no te devuelva a la portada.
  Si algo no cuadra, se cae a `'dashboard'`. Se borra al cerrar sesión, para que
  en un navegador compartido nadie herede la pestaña del anterior.
- **Cubierto por:** smoke test **S8** (tras recargar, el panel tiene que estar
  visible sin tocar nada). Verificado que **falla** con el código antiguo.
- **Lección:** una vista por defecto que *parece* inofensiva puede dejar la
  pantalla en blanco si ninguna rama la pinta. Nunca uses como estado inicial un
  valor que el render no cubre — y si el valor existe, cubrirlo o eliminarlo.

### INC-011 — Al ENTRAR con una cuenta existente, la app se quedaba en blanco ✅ resuelto
- **Síntoma:** iniciar sesión con un usuario que ya existe dejaba el cuerpo de la
  app vacío. Se veían la barra inferior y el saludo con el pseudónimo, pero el
  panel no. Hasta pulsar Inicio o Ranking no aparecía nada.
- **No es lo mismo que INC-010** (ese era al recargar la página). Este se dispara
  **al entrar**, y el arreglo de INC-010 no lo cubría.
- **Reproducido:** sí. Cerrar sesión → «Ya tengo cuenta» → entrar, y medir sin
  tocar nada: `main.innerText.length === 0` durante más de 24 s, y la vista
  interna atascada en `'welcome'`.
- **Causa raíz:** `onAuthStateChanged` avisa **dos veces** al iniciar sesión: la
  segunda con el usuario momentáneamente a `null`. La rama del `else` reseteaba
  `setCurrentUser(null)` y **`setActiveView('welcome')`** sin comprobar si de
  verdad había sesión. Justo después llegaba el usuario bueno y sus datos, así que
  la barra y el saludo sí aparecían — pero la vista ya se había quedado en
  `'welcome'`, y **ninguna rama del render pintaba esa vista**.
- **Solución, en dos partes:**
  1. La rama sin sesión solo resetea si de verdad no hay sesión
     (`else if (!auth.currentUser)`, leyendo el valor en vivo, no el del aviso).
  2. `'welcome'` **pinta el panel de Inicio**. Así, aunque algo vuelva a dejar la
     vista ahí, la pantalla nunca se queda vacía: es imposible que un valor del
     tipo `View` no tenga render.
- **Cubierto por:** smoke test **S9** (registro → cerrar sesión → entrar, y exigir
  el panel sin tocar nada). Verificado que **falla** con el código antiguo.
- **Lección:** un cambio de estado dentro de un callback asíncrono de autenticación
  debe comprobar la **fuente de verdad** (`auth.currentUser`), no el argumento del
  callback: los proveedores avisan de más y con valores transitorios.

### Y una lección sobre MIS PROPIOS tests
Al añadir S8 escribí el assert contra textos inventados (`Peso actual`,
`Ranking global`, `Registrar peso`). El test fallaba **con la app funcionando
perfectamente**, y estuve a punto de “arreglar” código que no estaba roto.
- **Los textos de un assert se copian del componente, nunca se imaginan.**
- **Los tests leen `BASE_URL`**, no `APP_URL` (`APP_URL` solo lo declara el spec
  por dentro). Pasar `APP_URL=...` hace que la batería corra **contra la web
  pública** sin avisar: comparas tu build local con el despliegue viejo.
- Antes de dar por bueno un resultado, **comprueba que el servidor sirve el build
  nuevo** (el hash del `assets/index-*.js` cambia). Un `vite preview` no recarga
  el bundle solo.

### INC-012 — Pantalla en blanco por caché tras cada despliegue ✅ resuelto
- **Síntoma:** justo después de publicar una versión nueva, la app aparecía en
  blanco. Le pasó a la usuaria tras pedir un cambio de color, y lo interpretó
  como *"le pedí un cambio y ahora no arranca"*.
- **Causa raíz:** no era el cambio. GitHub Pages **borra los assets del despliegue
  anterior** y sirve el `index.html` con `cache-control: max-age=600`. El
  navegador con la versión vieja en caché sigue pidiendo `assets/index-<viejo>.js`,
  que ya devuelve **404**, así que no carga nada. Comprobado: los assets del
  despliegue anterior daban 404 y los nuevos 200.
- **Solución (automática):** cada compilación escribe `version.json` con un id
  propio, que también queda incrustado en el bundle. La app lo consulta al
  arrancar, cada 5 minutos y al volver a la pestaña; si el id no es el suyo, se
  recarga con `?v=<nuevo id>`, que rompe la caché. No recarga mientras el usuario
  está escribiendo, para no perder un pesaje a medias. Ver `services/versionCheck.ts`.
- **Cubierto por:** smoke test **S10** (`version.json` existe y trae un `buildId`).

### INC-013 — Dos despliegues compitiendo (Pages en modo "rama") ✅ resuelto
- **Hallazgo:** la configuración de Pages seguía en `build_type: legacy` con origen
  `main` / carpeta `/docs`, mientras el workflow publica **por artefacto**. En cada
  push GitHub lanzaba además su `pages build and deployment` del `docs/` obsoleto:
  dos despliegues por el mismo destino. Si el viejo terminaba después, la web
  **retrocedía** a una versión de hacía semanas.
- **Efecto colateral:** la carpeta `docs/` (1,4 MB de build compilado) estaba
  commiteada en el repo, que no es sitio para un artefacto de compilación.
- **Solución:** `build_type: workflow` (solo el workflow publica), y `docs/`
  eliminada del repositorio. Comprobado: tras el cambio solo corre **un** workflow
  por push.
- **Lección:** no basta con que el workflow publique bien; hay que comprobar **quién
  más** está publicando en el mismo sitio. La API de Pages puede seguir anunciando
  un origen (`main`/`docs`) que ya no es el que sirve: lo que manda es `build_type`.

### INC-014 — El final del contenido quedaba tapado por la barra inferior ✅ resuelto
- **Síntoma:** en el panel, el último bloque (la pregunta «¿Comiste fuera ayer?» y
  sus casillas) quedaba parcialmente **por debajo de la barra de navegación**, que
  va fija abajo.
- **Causa:** `<main>` no reservaba espacio para la barra (`h-16`), así que al
  llegar al final del scroll el contenido se metía debajo.
- **Solución:** `pb-24` en el `<main>`. Comprobado midiendo: al final del scroll el
  último contenido termina en 608 px y la barra empieza en 780 px, así que ya no
  se solapan.
- **Lección:** con una barra `fixed` hay que reservar su alto como relleno del
  contenedor que hace scroll. Es fácil que pase desapercibido en pantallas cortas
  porque solo afecta al último elemento.

### Cambio de diseño (opción «tarjetas que flotan») ✅ aplicado
- **Motivo:** la usuaria lo pidió — «demasiado blanco y las tarjetas destacan poco».
  El fondo era `#f8fafc` y las tarjetas blancas puras: sin contraste.
- **Qué cambió:** fondo con degradado suave; tarjetas blancas con borde y sombra
  reales (`.card`); botones en degradado (`.btn-primary`); barras superior e
  inferior translúcidas (`.bar-blur`); campos con lavanda tenue (`.field`); y los
  iconos inactivos de la barra un escalón más oscuros, que antes casi no se veían.
- **Cómo está montado:** los estilos viven en `index.css` como clases reutilizables,
  no repartidos por los componentes. Cambiar el tratamiento entero es tocar ahí.
- **Sin cambios de comportamiento:** solo aspecto. Nada de librerías nuevas.

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
| S7a | El ranking se lee, pero no contiene datos personales | ✅ |
| S7b | Un usuario normal NO puede listar la colección privada | ✅ |
| S7c | Un usuario normal NO puede leer el documento privado de otro | ✅ |
| S7d | Cada usuario sí puede leer y escribir sus propios datos privados | ✅ |
| S7e | Nadie puede auto-ascenderse a administrador | ✅ |
| S7f | Un usuario normal no puede escribir la configuración del reto | ✅ |
| S7g | Cada usuario puede borrar sus propios datos | ✅ |

Los tests **se limpian solos**: borran la cuenta y los datos que crean (ver
`tests/e2e/helpers/cleanup.ts`), así que el proyecto no acumula basura en cada
despliegue.

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
