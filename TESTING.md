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
- **Gráfico del historial en barras:** a petición suya (como la propuesta que eligió),
  el historial pasó de gráfico de área (línea) a **barras verticales**, una por
  pesaje, con la más reciente destacada en violeta y el resto en lavanda. Cubierto
  por **S12**, que comprueba que hay una barra por pesaje y ninguna área; el test
  **falla** con el gráfico de línea antiguo (comprobado), así que un refactor no
  puede devolverlo a línea en silencio.
- **Sin cambios de comportamiento:** solo aspecto. Nada de librerías nuevas.

### Ajustes del panel (segunda ronda) ✅ aplicados
- **La tarjeta de registro, antes del historial.** Se registra el peso a diario;
  el gráfico es para consultar, así que el registro va primero.
- **El gráfico abarca TODO el reto**, no solo los días con pesaje: se dibuja un
  hueco por día del periodo y la barra va en su día real. Antes el eje era
  `S0, S1, S2…` (la posición del pesaje, no la fecha), lo que no decía nada.
- **Fecha dd/mm bajo cada barra.** Con un pesaje diario no caben todas las fechas
  en ~300 px, así que se rotula con un mínimo de 4 días entre etiquetas y siempre
  la del pesaje más reciente. Si en algún momento se quieren todas, habría que
  rotularlas en diagonal o dejar desplazar el gráfico en horizontal.
- **Paginación si el reto pasa de un mes** (`DIAS_POR_PAGINA = 31`): flechas de
  periodo anterior/siguiente y rango visible. El reto actual (10/10→09/11, 31
  días) cabe en un solo periodo, así que enseña solo el rango. Con un periodo
  único no se muestran flechas que no llevarían a ningún sitio.
- **Mensaje motivacional** un punto más pequeño (`text-xl` → `text-lg`, 20→18 px).
- **Ojo al comprobar el eje en los tests:** recharts pinta el texto de las marcas
  **fuera** del grupo `.recharts-xAxis`. Buscarlo ahí devuelve vacío aunque las
  fechas se vean en pantalla; hay que buscarlo en `.recharts-surface text`. Me
  pasó y me llevó a "arreglar" algo que ya funcionaba.

### Ajustes del panel (tercera ronda) ✅ aplicados
- **Tarjeta de registro más baja.** Medido con la misma cuenta y el mismo estado:
  **231 → 197 px** con el formulario, y **296 → 148 px** en el estado "peso
  guardado" (ese dejó de ser un bloque grande centrado y pasó a una fila
  compacta). Menos relleno, y el icono del check más pequeño.
- **Fuera las fechas bajo las barras.** Se amontonaban y no quedaban bien; el
  dato se ve al pasar por encima. El eje se mantiene con `tick={false}` porque el
  tooltip necesita la categoría para poder mostrar la fecha.
- **Los mensajes motivacionales ya no mencionan puntos.** Se pasaban a Gemini en
  el prompt (`Puntos totales: ...`) y el mensaje se guarda en el móvil **un día
  entero**, así que cualquier cifra acababa desfasada. Ahora no se le pasan y se
  le prohíbe explícitamente mencionar puntos o cualquier número. El mensaje de
  reserva que decía "¡A seguir sumando puntos!" está reescrito.
  **Regla general:** un texto que se cachea no puede contener datos que cambian.
- **Tarjeta del premio en azul brillante** (antes negra, no encajaba). Degradado
  azul y los elementos interiores aclarados para que se lean sobre el color.
- **Fechas del premio en formato español fijo.** Con `toLocaleDateString()` a
  secas el formato dependía del idioma del dispositivo, y en un móvil en inglés
  el periodo salía como `10/10/2026 - 11/9/2026`, que parece que el reto acaba
  antes de empezar. Fijado a `'es-ES'`.

---

### Panel de administrador: invitar por WhatsApp y alta manual ✅ aplicado
- **Tarjeta "Invitar al reto"** en el panel: el enlace a la vista, botón que abre
  WhatsApp con el mensaje ya escrito y botón de copiar. El enlace se calcula en
  vivo (`window.location.origin + pathname`), así que vale igual en la web
  publicada que en una prueba en local.
- **Arreglo: los apuntados a mano no podían entrar.** Se creaban con un
  identificador inventado, no el de su cuenta de acceso, así que al registrarse
  esa persona salían **dos perfiles** (la ficha vacía + su perfil real). Ahora el
  formulario pide el email y la clave se **deriva** de él; al registrarse, la
  ficha apuntada se borra sola.
- **Firebase NO deja saber si un email ya tiene cuenta, y es a propósito.**
  Comprobado contra la API real: `createAuthUri` responde 200 pero **sin** el
  campo `registered` (solo aparece si el proveedor de "enlace por email" está
  activo), y `signInWithPassword` devuelve **el mismo** `INVALID_LOGIN_CREDENTIALS`
  con una cuenta que existe y con una que no. Es anti-enumeración: nadie puede
  averiguar quién está registrado en un sitio. Por eso el alta no puede
  "vincularse" a una cuenta: no hay forma de encontrarla.
- **El panel NO puede cambiar el rol de nadie desde la app.** Se intentó hacer
  admin a otra persona: las reglas lo bloquean a propósito (si no, cualquiera
  podría ascenderse). Para que alguien sea admin hay que añadir su email a
  `adminEmails()` en `firestore.rules` **y** a `ADMIN_EMAILS` en `App.tsx`, y
  desplegar. Es un cambio de permisos, no un ajuste de interfaz.
- **Un test que necesita cuenta de admin tiene que SALTARSE si no hay
  credenciales.** La CI ejecuta todo `tests/e2e/`, y allí no hay cuenta de admin:
  sin el `test.skip` la batería entera saldría roja por una pantalla que solo
  existe para la dueña, tapando fallos reales.

---

### Copia de seguridad de los datos ✅ aplicado
- **El hueco más grave que había:** los pesajes de todo el grupo vivían **solo** en
  Firestore y **no existía ninguna copia**. Si se perdían, no había vuelta atrás.
  Ahora el panel tiene un botón que descarga **todo** en un fichero.
- **La lógica está separada de la red a propósito** (`services/backup.ts` sin
  tocar Firestore). Así la parte que puede perder datos se prueba de verdad con
  tests; leer los datos necesita sesión de admin y no se puede probar sin ella.
- **La regla que no se puede romper: todo lo que entra, sale.** Una copia que se
  deja datos fuera es **peor** que no tener copia, porque da una falsa sensación
  de estar cubierto. Hay un test por cada forma de perderlos: documentos
  cambiados (B1), resumen que no cuadra (B2), pérdida parcial en un caso grande
  (B3), sin datos (B4), persona sin historial (B5), y campos nuevos que no se
  copian por descuido (B7).
- **Los documentos se copian ENTEROS, sin filtrar campos.** Copiar campo por campo
  es exactamente cómo se pierden datos en silencio cuando alguien añade algo
  nuevo. Lo mismo con la configuración del reto y el identificador de cada
  documento (sin él, un historial no se sabe de quién es).
- **Se leen las tres fuentes a la vez** (`Promise.all`): si una falla, **no** se
  genera un fichero a medias.
- **El nombre lleva fecha Y hora** (local, no UTC) para poder guardar varias
  copias el mismo día sin que una machaque a la otra.
- **El fallo de permisos se traduce.** Firestore dice «Missing or insufficient
  permissions», que no explica nada a quien no es programador; el panel dice que
  hay que entrar con la cuenta de administradora.
- **Comprobado con A/B**: quitando los historiales de la copia, B1/B2/B3 se ponen
  en rojo. Los tests cazan el fallo, no pasan por casualidad.

---

### Aviso automático si la web se cae o las reglas se abren ✅ aplicado
- **`scripts/health-check.mjs`** comprueba cuatro cosas que fallan de verdad:
  1. La web carga con el armazón de la app, y **el bundle y el CSS responden 200**
     → es el **INC-001** (assets 404 = pantalla en blanco para todos).
  2. **Los ficheros publicados son del MISMO despliegue**: el `buildId` que
     anuncia `version.json` tiene que estar **incrustado dentro del bundle**
     servido. Es lo que caza el **INC-013** (dos despliegues compitiendo, sitio a
     medias o viejo). Comprobado con un despliegue falso descuadrado: lo detecta y
     dice cuál es el fichero descolocado.
  3. La base de datos responde y la configuración del reto se puede leer.
  4. **Las reglas siguen cerradas**, reutilizando la sonda ya probada
     (`scripts/probe-rules.mjs`) en vez de reimplementar las comprobaciones.
- **Modo `--silencioso`, patrón vigilante:** no imprime nada si todo va bien y
  solo habla si hay un problema. Es lo que permite que la tarea programada no
  mande un mensaje cada 6 horas diciendo "todo bien" (que se ignora enseguida y
  acaba tapando el aviso que importa).
- **Corre en cada despliegue** (paso nuevo en la CI, después de los smoke tests):
  si el sitio sale mal publicado, el despliegue queda marcado en rojo.
- **Y cada 6 horas** como tarea programada, que avisa a Elena por Telegram.
  OJO: esa tarea vive en esta máquina, así que **si la máquina está apagada, no
  comprueba nada** y no avisa. No sustituye a mirar la web de vez en cuando.

### Test de las dos listas de administradores ✅ aplicado
- El email de admin está en **dos sitios**: `ADMIN_EMAILS` en `App.tsx` (decide si
  se ve el panel) y `adminEmails()` en `firestore.rules` (**la que manda**, decide
  quién puede escribir). Si se desajustan no falla nada visible, pasan cosas raras:
  el panel se abre y no deja guardar, o alguien tiene permisos y no ve el panel.
- `tests/e2e/config-admin.spec.ts` (C1) compara las dos listas y, si difieren,
  **dice qué email sobra y en cuál de los dos sitios está**. Corre en CI: no
  necesita navegador ni credenciales.
- **Guarda contra un falso "todo bien":** si alguien cambia el formato de una de
  las listas, una búsqueda ingenua no encontraría nada, las dos quedarían vacías y
  comparadas darían iguales. El test exige que las dos listas se hayan leído **no
  vacías**, así que un cambio de formato falla ruidosamente con un mensaje que
  explica qué hacer.
- Comprobado con A/B: añadiendo un email solo en la app, C1 falla señalándolo;
  renombrando la constante, falla con "no se encontró la lista".
- **De paso se corrigió un comentario falso** en `App.tsx` que decía que la lista
  estaba también en `services/firebase.ts`, fichero que no la tiene: una pista
  falsa de las que hacen perder el rato buscando dónde está la diferencia.

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
| S13 | El panel de admin: enlace, formulario con email y copia de seguridad | ⏭️ se salta sin credenciales de admin |
| B1 | La copia no pierde nada: todo lo que entra sale igual | ✅ |
| B2 | El resumen de la copia cuadra con lo que hay dentro | ✅ |
| B3 | Caso grande (10×31): no se cae ningún pesaje por el camino | ✅ |
| B4 | Sin datos no revienta (y dice la verdad) | ✅ |
| B5 | Una persona sin historial no rompe el recuento | ✅ |
| B6 | El fichero lleva fecha, hora y versión del formato | ✅ |
| B7 | No se descarta ningún campo: lo nuevo entra solo | ✅ |
| C1 | Las dos listas de administradores (app y reglas) dicen lo mismo | ✅ |
| C2 | El email de admin no depende de mayúsculas ni espacios | ✅ |
| V | Vigilante de la web publicada (`scripts/health-check.mjs`) | ✅ corre en cada despliegue |

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
