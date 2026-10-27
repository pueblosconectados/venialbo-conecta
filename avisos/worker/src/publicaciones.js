// Las Actions que fallan: en cada vuelta del cron (cada 5 minutos) se miran las últimas
// ejecuciones de los workflows del repositorio y se avisa al grupo de Telegram cuando
// una falla, y cuando ese mismo workflow vuelve a salir bien. Lo que más importa es la
// publicación de la web: si falla, lo que se guarda en el CMS no sale, y GitHub solo lo
// dice por correo.
//
// Se hace desde aquí, y no con un paso `if: failure()` en cada workflow, porque así no
// hay que llevar los secretos de Telegram a GitHub y vale para cualquier workflow,
// también los que se añadan. Usa el mismo GITHUB_TOKEN que lanza las Actions (con
// "Actions: Read and write" basta). Si GitHub lo rechaza (ha caducado o le han quitado
// permisos), se avisa una vez: es lo que hace que deje de traer solos los formularios.
//
// El estado va en el KV ESTADO, clave "publicaciones":
//   { visto: ISO de la última ejecución terminada ya mirada,
//     fallando: { <ruta del workflow>: { nombre, desde, url, reintentado } }, tokenMalo: bool }
//
// Mientras un workflow sigue fallando no se repite el aviso, salvo si alguien lo ha
// reintentado desde Telegram (marcarReintentado) y el reintento vuelve a fallar.

import { listarEjecuciones } from "./github.js";
import { aTelegram, escapaHtml } from "./telegram.js";

const CLAVE = "publicaciones";

// Un nombre claro y lo que deja de pasar mientras falla, por workflow. Los demás salen
// con su `name:` y sin frase.
const WORKFLOWS = {
  ".github/workflows/web-static-pages.yml": {
    nombre: "Publicar la web",
    efecto: "lo que se guarde en el CMS no sale en la web",
  },
  ".github/workflows/avisos.yml": { nombre: "Avisos push", efecto: "no se mandan los avisos push de lo nuevo" },
  ".github/workflows/altas-negocio.yml": {
    nombre: "Traer las altas de negocio",
    efecto: "las altas de negocio no se traen al CMS",
  },
  ".github/workflows/anuncios-tablon.yml": {
    nombre: "Traer los anuncios del tablón",
    efecto: "los anuncios del tablón no se traen al CMS",
  },
  ".github/workflows/ficha-tally.yml": {
    nombre: "Ficha de Tally (botones de Telegram)",
    efecto: "no se ha hecho lo que se pidió con el botón: hay que volver a pulsarlo o hacerlo desde el CMS",
    // Necesita sus inputs (qué ficha y qué hacer): relanzarlo a secas no sirve
    sinReintentar: true,
  },
  ".github/workflows/enlaces.yml": {
    nombre: "Comprobar los enlaces",
    efecto: "no se avisa de los enlaces rotos",
  },
  ".github/workflows/casas.yml": {
    nombre: "Traer las casas",
    efecto: "las casas en venta y alquiler no se traen al CMS",
  },
};

// El nombre claro de un workflow por su fichero ("web-static-pages.yml"), para los
// mensajes del bot
export const nombreDe = (fichero) => WORKFLOWS[`.github/workflows/${fichero}`]?.nombre ?? fichero;

// Lo que cuenta como fallo. "cancelled" no: lo produce la `concurrency` cuando un
// guardado nuevo deja vieja la publicación anterior.
const FALLOS = new Set(["failure", "timed_out", "startup_failure"]);

const duracion = (desde, hasta) => {
  const minutos = Math.max(1, Math.round((hasta - desde) / 60_000));
  const horas = Math.floor(minutos / 60);
  if (!horas) return `${minutos} min`;
  return minutos % 60 ? `${horas} h ${minutos % 60} min` : `${horas} h`;
};

const primeraLinea = (texto) => String(texto ?? "").split("\n")[0].slice(0, 120);

// Compara las ejecuciones con lo ya visto. Devuelve el estado nuevo y los mensajes.
// `ejecuciones` es lo que devuelve GitHub (o null si rechazó el token).
export const revisar = (anterior, ejecuciones, ahora) => {
  const mensajes = [];
  const nuevo = { visto: anterior.visto, fallando: { ...anterior.fallando }, tokenMalo: false };

  if (ejecuciones === null) {
    if (!anterior.tokenMalo) {
      mensajes.push({
        texto:
          "⚠️ <b>GitHub ya no acepta el token del Worker</b>\nPuede que haya caducado. Mientras no se renueve, no se avisa de las publicaciones que fallen ni se traen solos los formularios.\nSe cambia con <code>npx wrangler secret put GITHUB_TOKEN</code> en avisos/worker.",
        botones: [{ text: "Crear un token nuevo", url: "https://github.com/settings/personal-access-tokens" }],
      });
    }
    return { nuevo: { ...anterior, tokenMalo: true }, mensajes };
  }
  if (anterior.tokenMalo) mensajes.push({ texto: "🟢 GitHub vuelve a aceptar el token del Worker." });

  // La primera vez no se avisa de lo antiguo: se empieza a mirar desde ahora
  if (!anterior.visto) return { nuevo: { ...nuevo, visto: new Date(ahora).toISOString() }, mensajes };

  const terminadas = ejecuciones
    .filter((e) => e.status === "completed" && e.updated_at > anterior.visto)
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at));

  for (const e of terminadas) {
    nuevo.visto = e.updated_at > nuevo.visto ? e.updated_at : nuevo.visto;
    const yaFallaba = nuevo.fallando[e.path];
    const { nombre = e.name, efecto, sinReintentar } = WORKFLOWS[e.path] ?? {};
    const reintentar = (fichero) => (sinReintentar ? [] : [{ text: "🔁 Reintentar", callback_data: `reintentar:${fichero}` }]);

    if (FALLOS.has(e.conclusion) && yaFallaba?.reintentado) {
      mensajes.push({
        texto: `🔴 <b>«${escapaHtml(nombre)}» sigue fallando después de reintentarlo</b>\nToca mirar qué pasa.`,
        botones: [{ text: "Ver qué ha pasado", url: e.html_url }, ...reintentar(e.path.split("/").pop())],
      });
      nuevo.fallando[e.path] = { ...yaFallaba, url: e.html_url, reintentado: false };
    } else if (FALLOS.has(e.conclusion) && !yaFallaba) {
      const lineas = [`🔴 <b>Ha fallado «${escapaHtml(nombre)}»</b>`];
      if (e.display_title && e.display_title !== e.name && e.display_title !== nombre) lineas.push(`«${escapaHtml(primeraLinea(e.display_title))}»`);
      if (efecto) lineas.push(`Mientras no se arregle, ${efecto}.`);
      // «Reintentar» lanza el workflow de nuevo sobre main (lo atiende comandos.js). No se
      // repite la ejecución fallida: esa publicaría su commit, quizá ya viejo.
      const fichero = e.path.split("/").pop();
      mensajes.push({
        texto: lineas.join("\n"),
        botones: [{ text: "Ver qué ha pasado", url: e.html_url }, ...reintentar(fichero)],
      });
      nuevo.fallando[e.path] = { nombre, desde: Date.parse(e.updated_at), url: e.html_url };
    } else if (e.conclusion === "success" && yaFallaba) {
      mensajes.push({
        texto: `🟢 <b>«${escapaHtml(nombre)}» vuelve a funcionar</b>\nHa estado fallando ${duracion(yaFallaba.desde, Date.parse(e.updated_at))}.`,
        botones: [{ text: "Ver la ejecución", url: e.html_url }],
      });
      delete nuevo.fallando[e.path];
    }
  }
  return { nuevo, mensajes };
};

const leerEstado = async (env) => (await env.ESTADO.get(CLAVE, "json")) ?? { visto: null, fallando: {}, tokenMalo: false };

// Apunta que alguien ha reintentado ese workflow (el fichero, "web-static-pages.yml"),
// para avisar si el reintento también falla. Devuelve si estaba fallando; si no, no hace
// nada.
export const marcarReintentado = async (env, fichero) => {
  const estado = await leerEstado(env);
  const ruta = `.github/workflows/${fichero}`;
  if (!estado.fallando[ruta]) return false;
  estado.fallando[ruta].reintentado = true;
  await env.ESTADO.put(CLAVE, JSON.stringify(estado));
  return true;
};

// Lo que falla ahora, para /estado: [{ nombre, desde, url }]
export const fallandoAhora = async (env) => Object.values((await leerEstado(env)).fallando);

// Lo que hace el cron
export const revisarPublicaciones = async (env, { ahora = Date.now() } = {}) => {
  const anterior = await leerEstado(env);
  let ejecuciones;
  try {
    ejecuciones = await listarEjecuciones(env);
  } catch {
    // GitHub no contesta o da un error suyo: esta vuelta no se mira nada
    return;
  }
  const { nuevo, mensajes } = revisar(anterior, ejecuciones, ahora);
  for (const { texto, botones } of mensajes) {
    // Si Telegram falla no se guarda: la próxima vuelta se vuelve a intentar
    if (!(await aTelegram(env, texto, botones))) throw new Error("Telegram no aceptó el aviso");
  }
  if (JSON.stringify(nuevo) !== JSON.stringify(anterior)) await env.ESTADO.put(CLAVE, JSON.stringify(nuevo));
};
