/// <reference types="vite/client" />

// Sin este fichero, TypeScript no reconoce `import.meta.env` y la comprobación de
// tipos falla (con un error que no dice nada del problema real). Es el fichero que
// traen de serie los proyectos de Vite; este no lo tenía porque hasta ahora nadie
// leía variables del entorno desde el navegador.
