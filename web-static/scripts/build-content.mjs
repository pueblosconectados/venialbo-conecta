// Genera public/data/ a partir de los ficheros de content/ (editados con Pages CMS).
//
//   content/<recurso>/<slug>.json  →  public/data/<recurso>.json       (listado)
//                                     public/data/<recurso>/<slug>.json (detalle)
//
// El id de cada entrada es el nombre del fichero sin extensión. La forma de los datos
// imita la antigua API del backend para que las páginas no tengan que cambiar.

import { access, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = join(ROOT, "content");
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = join(PUBLIC_DIR, "data");

// Adjuntos de noticias y actividades. Pages CMS sabe limitar el numero de archivos y la
// extension, pero no el peso, asi que el tamano se comprueba aqui: si algo se
// pasa, el build falla y la web no se publica.
const MAX_PDFS = 3;
const MAX_BYTES_PDF = 10 * 1024 * 1024;

const idDe = (fichero) => basename(fichero, ".json");

// Pages CMS guarda los campos vacíos como "": se normalizan a null
const limpiar = (valor) => {
  if (valor === "") return null;
  if (Array.isArray(valor)) return valor.map(limpiar);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, limpiar(v)]));
  }
  return valor;
};

const leerColeccion = async (recurso) => {
  const dir = join(CONTENT_DIR, recurso);
  const ficheros = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".json"));
  return Promise.all(
    ficheros.map(async (f) => {
      try {
        const datos = JSON.parse(await readFile(join(dir, f), "utf8"));
        return { id: idDe(f), ...limpiar(datos) };
      } catch (error) {
        throw new Error(`JSON inválido en content/${recurso}/${f}: ${error.message}`);
      }
    }),
  );
};

const escribir = async (recurso, listado, detalles) => {
  await writeJson(join(DATA_DIR, `${recurso}.json`), listado);
  for (const detalle of detalles) {
    await writeJson(join(DATA_DIR, recurso, `${detalle.id}.json`), detalle);
  }
  console.log(`${recurso}: ${listado.length}`);
};

const writeJson = async (path, data) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data));
};

const porTexto = (campo) => (a, b) => (a[campo] ?? "").localeCompare(b[campo] ?? "", "es");
const porFechaDesc = (a, b) => (b.fecha_publicacion ?? "").localeCompare(a.fecha_publicacion ?? "");
const quitar = (obj, ...campos) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !campos.includes(k)));

// Direcciones que se pegan a mano en el CMS, que no las comprueba (enlaces de interés,
// «Más enlaces» de los servicios). Lo que viene sin https:// se completa; lo que ni así
// es una dirección (una frase, como pasó con el enlace de la Fuente el Macho) para el
// build, para que no salga un enlace roto.
const leerDireccion = (texto, quien) => {
  const limpia = String(texto ?? "").trim();
  const completa = /^https?:\/\//i.test(limpia) ? limpia : `https://${limpia}`;
  let url;
  try {
    url = new URL(completa);
  } catch {
    url = null;
  }
  if (!limpia || /\s/.test(limpia) || !url?.hostname.includes(".")) {
    throw new Error(`${quien}: "${texto}" no es una dirección. Tiene que ser como https://www.facebook.com/...`);
  }
  return url.href;
};

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// Comprueba los PDF de una noticia, una actividad o un anuncio y les añade el tamaño, para poder
// avisar en la web de lo que pesa cada descarga. `quien` es para el mensaje de error.
const revisarDocumentos = async (quien, entrada) => {
  const docs = (entrada.documentos ?? []).filter((d) => d?.archivo);
  if (docs.length > MAX_PDFS) {
    throw new Error(`${quien}: ${docs.length} documentos, el máximo son ${MAX_PDFS}`);
  }
  return Promise.all(
    docs.map(async (d) => {
      const ruta = join(PUBLIC_DIR, d.archivo.replace(/^\//, ""));
      if (!/\.pdf$/i.test(d.archivo)) {
        throw new Error(`${quien}: ${d.archivo} no es un PDF`);
      }
      const info = await stat(ruta).catch(() => null);
      if (!info) {
        throw new Error(`${quien}: no se encuentra ${d.archivo}`);
      }
      if (info.size > MAX_BYTES_PDF) {
        throw new Error(
          `${quien}: ${d.archivo} pesa ${mb(info.size)} y el máximo son ${mb(MAX_BYTES_PDF)}`,
        );
      }
      return { ...d, tamano: info.size };
    }),
  );
};

await rm(DATA_DIR, { recursive: true, force: true });

// Categorías
const categorias = (await leerColeccion("categorias")).sort(porTexto("nombre"));
const categoriaPorId = new Map(categorias.map((c) => [c.id, c]));
await escribir("categorias", categorias, categorias);

// Noticias — la categoría se guarda como ruta del fichero referenciado
const noticias = (
  await Promise.all(
    (await leerColeccion("noticias"))
      .filter((n) => n.activa !== false)
      .map(async (n) => {
        const categoria = categoriaPorId.get(n.categoria ? idDe(n.categoria) : "");
        if (!categoria) console.warn(`  ⚠ noticia ${n.id}: categoría no encontrada (${n.categoria})`);
        return {
          ...n,
          categoria: categoria ?? { id: "", nombre: "Sin categoría", icono: null, color: null },
          documentos: await revisarDocumentos(`noticia ${n.id}`, n),
        };
      }),
  )
).sort(porFechaDesc);
// Los adjuntos solo se usan en la ficha, no en el listado.
await escribir("noticias", noticias.map((n) => quitar(n, "contenido", "documentos")), noticias);

// Negocios
const negocios = (await leerColeccion("negocios"))
  .filter((n) => n.activo !== false)
  .sort(porTexto("nombre"));
await escribir("negocios", negocios, negocios);

// Servicios
const servicios = (await leerColeccion("servicios"))
  .filter((s) => s.activo !== false)
  // «Más enlaces»: sin las filas vacías y con la dirección comprobada
  .map((s) => ({
    ...s,
    enlaces: (s.enlaces ?? [])
      .filter((e) => e?.url)
      .map((e) => ({
        texto: e.texto || new URL(leerDireccion(e.url, `servicio ${s.id}`)).hostname,
        url: leerDireccion(e.url, `servicio ${s.id}`),
      })),
  }))
  .sort((a, b) => porTexto("tipo")(a, b) || porTexto("nombre")(a, b));
await escribir("servicios", servicios, servicios);

// Actividades — la agenda: lo que se va a hacer y, cuando pasa, lo ya celebrado, con sus
// fotos. No caducan: la web las separa al visitarla (yaCelebrada). "Organiza" y la
// noticia relacionada se guardan como ruta del fichero referenciado: se sustituyen por lo
// justo para pintar el enlace, y si lo referenciado está oculto o ya no existe, se
// quita el enlace en vez de dejarlo roto.
const servicioPorId = new Map(servicios.map((s) => [s.id, s]));
const noticiaPorId = new Map(noticias.map((n) => [n.id, n]));
const enlaceA = (ruta, porId, campo, quien) => {
  if (!ruta) return null;
  const destino = porId.get(idDe(ruta));
  if (!destino) {
    console.warn(`  ⚠ ${quien}: no se encuentra ${ruta}, o está oculto`);
    return null;
  }
  return { id: destino.id, [campo]: destino[campo] };
};
// La hora se escribe a mano en el CMS: "18:30", "9:30", "9.30", "18h"… Se deja como
// "HH:MM" para que ordene bien. Si no se entiende, se quita con un aviso en vez de
// romper el build: la actividad sigue valiendo sin hora.
const leerHora = (texto, quien) => {
  if (texto == null || String(texto).trim() === "") return null;
  const m = String(texto).trim().match(/^([01]?\d|2[0-3])\s*(?:[:.h]\s*([0-5]\d)?)?\s*h?$/i);
  if (!m) {
    console.warn(`  ⚠ ${quien}: no se entiende la hora "${texto}", se quita`);
    return null;
  }
  return `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`;
};
// La de fin solo vale con la de inicio y si es después: un curso que acaba a la
// 1 de la madrugada no lo hay, y es más probable que sea una errata.
const leerHoras = (a, quien) => {
  const hora = leerHora(a.hora, quien);
  let hora_fin = leerHora(a.hora_fin, quien);
  if (hora_fin && (!hora || hora_fin <= hora)) {
    console.warn(
      `  ⚠ ${quien}: la hora de fin (${hora_fin}) ${hora ? `no es después de la de inicio (${hora})` : "no tiene hora de inicio"}, se quita`,
    );
    hora_fin = null;
  }
  return { hora, hora_fin };
};
// Cada cuántas semanas se repite. Sin «Hasta» no hay hasta cuándo: se ignora con un
// aviso en vez de llenar el calendario del móvil de clases para siempre.
const SEMANAS_REPETICION = { semanal: 1, quincenal: 2 };
const leerRepeticion = (a, quien) => {
  if (!a.repeticion) return null;
  if (!SEMANAS_REPETICION[a.repeticion]) {
    console.warn(`  ⚠ ${quien}: repetición "${a.repeticion}" desconocida, se quita`);
    return null;
  }
  if (!a.fecha_fin || a.fecha_fin.slice(0, 10) <= (a.fecha ?? "").slice(0, 10)) {
    console.warn(`  ⚠ ${quien}: se repite pero no tiene «Hasta», se quita la repetición`);
    return null;
  }
  return a.repeticion;
};
const actividades = (
  await Promise.all(
    (await leerColeccion("actividades"))
      .filter((a) => a.activa !== false)
      .map(async (a) => {
        const quien = `actividad ${a.id}`;
        return {
          ...a,
          ...leerHoras(a, quien),
          repeticion: leerRepeticion(a, quien),
          organiza: enlaceA(a.organiza, servicioPorId, "nombre", quien),
          noticia: enlaceA(a.noticia, noticiaPorId, "titulo", quien),
          // Una fila de la galería que se quedó sin foto no pinta nada
          galeria: (a.galeria ?? []).filter((g) => g?.imagen),
          documentos: await revisarDocumentos(quien, a),
        };
      }),
  )
)
  // A igual fecha, la hora y luego el id (que empieza por la fecha de creación)
  .sort(
    (a, b) =>
      (b.fecha ?? "").localeCompare(a.fecha ?? "") ||
      (b.hora ?? "").localeCompare(a.hora ?? "") ||
      b.id.localeCompare(a.id),
  );
// El listado solo necesita la tarjeta
await escribir(
  "actividades",
  actividades.map((a) => ({
    ...quitar(a, "contenido", "documentos", "galeria", "noticia", "video_url", "album_externo"),
    fotos: a.galeria.length,
  })),
  actividades,
);

const actividadPorId = new Map(actividades.map((a) => [a.id, a]));

// Fechas señaladas — días del pueblo que solo se marcan en el calendario, sin ficha.
// Las de «Todos los años» las repite la web (y el .ics con RRULE) cada año desde el de
// su fecha. Un «Hasta» que no es posterior a la fecha se quita.
const fechas = (await leerColeccion("fechas"))
  .filter((f) => f.activa !== false)
  .filter((f) => {
    if (f.fecha) return true;
    console.warn(`  ⚠ fecha señalada ${f.id}: no tiene fecha, se quita`);
    return false;
  })
  .map((f) => ({
    id: f.id,
    nombre: f.nombre,
    fecha: f.fecha.slice(0, 10),
    fecha_fin: f.fecha_fin && f.fecha_fin.slice(0, 10) > f.fecha.slice(0, 10) ? f.fecha_fin.slice(0, 10) : null,
    anual: f.anual === true,
    nota: f.nota ?? null,
  }))
  .sort((a, b) => a.fecha.localeCompare(b.fecha) || porTexto("nombre")(a, b));
await escribir("fechas", fechas, []);

// Y la agenda como calendario (.ics) para suscribirse desde Google Calendar, el del
// iPhone o Outlook: se queda en el calendario del móvil y se actualiza solo cada vez
// que la aplicación vuelve a mirarlo.
//
// - Con hora y de un solo día (o que se repite), el evento va de la hora a la hora de
//   fin, o dura una hora si no la tiene. La hora va en hora de Madrid (TZID), no en
//   UTC: así una clase semanal de las 18:00 sigue a las 18:00 tras el cambio de hora.
// - Sin hora, o de varios días seguidos, es de día completo y la hora va en la
//   descripción; DTEND es el día siguiente al último, que no se incluye.
// - La que se repite es un solo evento con RRULE: cada N semanas hasta «Hasta».
const SITIO = (process.env.SITIO_URL ?? "https://venialboconecta.es").replace(/\/$/, "");
const DOMINIO = new URL(SITIO).hostname;
const diaIcs = (iso, sumar = 0) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + sumar);
  return d.toISOString().slice(0, 10).replaceAll("-", "");
};
const textoIcs = (s) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// Las líneas de un .ics no pueden pasar de 75 bytes: se parten y la continuación
// empieza por un espacio. Se cuenta en bytes y sin partir una letra con tilde.
const plegar = (linea) => {
  const trozos = [];
  let actual = "";
  for (const letra of linea) {
    const limite = trozos.length ? 74 : 75;
    if (Buffer.byteLength(actual + letra) > limite) {
      trozos.push(actual);
      actual = "";
    }
    actual += letra;
  }
  trozos.push(actual);
  return trozos.join("\r\n ");
};
// El contenido es Markdown: para la descripción basta el texto, sin marcas
const sinMarkdown = (md) =>
  md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>`]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const descripcionIcs = (a, conHora) => {
  const texto = a.resumen?.trim() || sinMarkdown(a.contenido ?? "");
  const corto = texto.length > 500 ? `${texto.slice(0, 500).replace(/\s+\S*$/, "")}…` : texto;
  const h = (x) => x.replace(/^0/, "");
  const hora = !conHora
    ? ""
    : a.hora_fin
      ? `De ${h(a.hora)} a ${h(a.hora_fin)}.`
      : `A las ${h(a.hora)}.`;
  return [hora, corto, `Más información: ${SITIO}/actividades/${a.id}`]
    .filter(Boolean)
    .join("\n\n");
};
// La zona horaria de Madrid, que el .ics tiene que describir para usar TZID:
// horario de verano del último domingo de marzo al último de octubre
const ZONA = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Madrid",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];
const horaIcs = (iso, hora, sumarHoras = 0) => {
  const [h, m] = hora.split(":").map(Number);
  return `${diaIcs(iso)}T${String(h + sumarHoras).padStart(2, "0")}${String(m).padStart(2, "0")}00`;
};
const sello = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const eventos = actividades
  .filter((a) => a.fecha)
  .map((a) => {
    const fin = a.fecha_fin && a.fecha_fin.slice(0, 10) > a.fecha.slice(0, 10) ? a.fecha_fin : a.fecha;
    const conHora = a.hora && (fin === a.fecha || a.repeticion);
    // Con repetición, cada clase es de un día: el intervalo lo pone la RRULE
    const finEvento = a.repeticion ? a.fecha : fin;
    const cuando = conHora
      ? [
          `DTSTART;TZID=Europe/Madrid:${horaIcs(a.fecha, a.hora)}`,
          // Sin hora de fin, una hora; a las 23:xx no se puede sumar, así que acaba
          // a las 23:59
          `DTEND;TZID=Europe/Madrid:${
            a.hora_fin
              ? horaIcs(a.fecha, a.hora_fin)
              : a.hora < "23:00"
                ? horaIcs(a.fecha, a.hora, 1)
                : `${diaIcs(a.fecha)}T235900`
          }`,
        ]
      : [`DTSTART;VALUE=DATE:${diaIcs(a.fecha)}`, `DTEND;VALUE=DATE:${diaIcs(finEvento, 1)}`];
    // UNTIL va en UTC si el inicio lleva hora (lo pide el estándar); el final del día
    // de «Hasta» en UTC no alcanza a la clase de la semana siguiente
    const repite = a.repeticion
      ? [
          `RRULE:FREQ=WEEKLY;INTERVAL=${SEMANAS_REPETICION[a.repeticion]};UNTIL=${
            conHora ? `${diaIcs(fin)}T235959Z` : diaIcs(fin)
          }`,
        ]
      : [];
    return [
      "BEGIN:VEVENT",
      `UID:actividad-${a.id}@${DOMINIO}`,
      `DTSTAMP:${sello}`,
      ...cuando,
      ...repite,
      `SUMMARY:${textoIcs(a.titulo)}`,
      `DESCRIPTION:${textoIcs(descripcionIcs(a, a.hora && !conHora))}`,
      `URL:${SITIO}/actividades/${a.id}`,
      "LOCATION:Venialbo (Zamora)",
      // Las de todo el día no ocupan la agenda (no salen como «ocupado»); las de hora sí
      `TRANSP:${conHora ? "OPAQUE" : "TRANSPARENT"}`,
      "END:VEVENT",
    ];
  });
// Las fechas señaladas, de día completo y sin ocupar la agenda. Las de todos los años
// se repiten con RRULE (un 29 de febrero, solo los bisiestos).
const eventosFechas = fechas.map((f) => [
  "BEGIN:VEVENT",
  `UID:fecha-${f.id}@${DOMINIO}`,
  `DTSTAMP:${sello}`,
  `DTSTART;VALUE=DATE:${diaIcs(f.fecha)}`,
  `DTEND;VALUE=DATE:${diaIcs(f.fecha_fin ?? f.fecha, 1)}`,
  ...(f.anual ? ["RRULE:FREQ=YEARLY"] : []),
  `SUMMARY:${textoIcs(f.nombre)}`,
  ...(f.nota ? [`DESCRIPTION:${textoIcs(f.nota)}`] : []),
  `URL:${SITIO}/actividades?vista=calendario`,
  "LOCATION:Venialbo (Zamora)",
  "TRANSP:TRANSPARENT",
  "END:VEVENT",
]);
const ics = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//VenialboConecta//Actividades//ES",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH",
  "X-WR-CALNAME:Actividades de Venialbo",
  "X-WR-CALDESC:Cursos\\, talleres\\, excursiones y fiestas de Venialbo. venialboconecta.es",
  "X-WR-TIMEZONE:Europe/Madrid",
  // Cada cuánto debe volver a mirarlo la aplicación (no todas hacen caso)
  "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
  "X-PUBLISHED-TTL:PT6H",
  ...ZONA,
  ...eventos.flat(),
  ...eventosFechas.flat(),
  "END:VCALENDAR",
];
await writeFile(join(DATA_DIR, "actividades.ics"), `${ics.map(plegar).join("\r\n")}\r\n`);

// Lugares — "Qué ver" de Descubre Venialbo. No caducan.
//
// Las coordenadas se escriben en un solo campo, tal cual las da Google Maps
// ("41.3871, -5.5412"), y aquí se separan. También vale un enlace largo de Google Maps
// que las lleve dentro (".../@41.3871,-5.5412,17z"); los cortos (maps.app.goo.gl) no,
// porque no las llevan. Si no se entienden, el build falla: un lugar con el mapa en
// mitad del océano es peor que uno sin mapa.
const leerCoordenadas = (texto, quien) => {
  if (!texto) return { latitud: null, longitud: null };
  const m = String(texto).match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  const latitud = m ? Number(m[1]) : NaN;
  const longitud = m ? Number(m[2]) : NaN;
  // Un recuadro holgado alrededor de España: pilla las coordenadas del revés, que es
  // el error más fácil de cometer, sin tener que afinar.
  if (!(latitud > 27 && latitud < 44.5 && longitud > -19 && longitud < 5)) {
    throw new Error(
      `${quien}: no se entienden las coordenadas "${texto}". Tienen que ser dos números` +
        ` con punto decimal, primero la latitud: 41.3871, -5.5412`,
    );
  }
  return { latitud, longitud };
};
const lugares = (await leerColeccion("lugares"))
  .filter((l) => l.activo !== false)
  .map((l) => ({
    ...quitar(l, "coordenadas"),
    ...leerCoordenadas(l.coordenadas, `lugar ${l.id}`),
    galeria: (l.galeria ?? []).filter((g) => g?.imagen),
  }))
  .sort(porTexto("nombre"));

// Rutas — "Rutas" de Descubre Venialbo. No caducan. Los lugares por los que pasa
// llegan como rutas de fichero (reference multiple): se cambian por {id, nombre}, en
// el orden en que se pusieron, y los ocultos o borrados se quitan con un aviso.
const lugarPorId = new Map(lugares.map((l) => [l.id, l]));
const revisarGpx = async (ruta, quien) => {
  if (!ruta) return null;
  if (!/\.gpx$/i.test(ruta)) throw new Error(`${quien}: ${ruta} no es un GPX`);
  const info = await stat(join(PUBLIC_DIR, ruta.replace(/^\//, ""))).catch(() => null);
  if (!info) throw new Error(`${quien}: no se encuentra ${ruta}`);
  return ruta;
};
const rutas = (
  await Promise.all(
    (await leerColeccion("rutas"))
      .filter((r) => r.activa !== false)
      .map(async (r) => {
        const quien = `ruta ${r.id}`;
        return {
          ...quitar(r, "coordenadas_salida"),
          ...leerCoordenadas(r.coordenadas_salida, quien),
          lugares: (r.lugares ?? [])
            .map((ruta) => enlaceA(ruta, lugarPorId, "nombre", quien))
            .filter(Boolean),
          gpx: await revisarGpx(r.gpx, quien),
          galeria: (r.galeria ?? []).filter((g) => g?.imagen),
        };
      }),
  )
).sort(porTexto("nombre"));
await escribir(
  "rutas",
  rutas.map((r) =>
    quitar(r, "contenido", "galeria", "recomendaciones", "lugares", "gpx", "wikiloc_url"),
  ),
  rutas,
);

// Y al revés: cada lugar lleva las rutas que pasan por él, para enlazarlas desde su ficha
const rutasPorLugar = new Map();
for (const r of rutas) {
  for (const l of r.lugares) {
    rutasPorLugar.set(l.id, [...(rutasPorLugar.get(l.id) ?? []), { id: r.id, nombre: r.nombre }]);
  }
}
await escribir(
  "lugares",
  lugares.map((l) => quitar(l, "contenido", "galeria", "como_visitar")),
  lugares.map((l) => ({ ...l, rutas: rutasPorLugar.get(l.id) ?? [] })),
);

// Enlaces de interés — una sola página, sin fichas: no hay detalle que escribir.
// La foto de la tarjeta: la que se suba a mano en el CMS o, si no hay, la que
// scripts/avatares.mjs haya bajado de la red social. Si no hay ninguna, sale el icono.
const avatarBajado = async (id) => {
  const ruta = `/avatares/${id}.webp`;
  return access(join(PUBLIC_DIR, ruta)).then(() => ruta, () => null);
};
const enlaces = (
  await Promise.all(
    (await leerColeccion("enlaces"))
      .filter((e) => e.activo !== false)
      .map(async (e) => ({
        ...quitar(e, "imagen"),
        url: leerDireccion(e.url, `enlace ${e.id}`),
        avatar: e.imagen ?? (await avatarBajado(e.id)),
      })),
  )
).sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es"));
await escribir("enlaces", enlaces, []);

// Anuncios — los caducados se ocultan en el navegador (staticDataProvider). La
// caducidad no es obligatoria en el CMS: Información sin fecha no caduca nunca, pero
// un anuncio de vecinos sin fecha caduca a los DIAS_ANUNCIO de publicarse, como los
// que llegan por el formulario, para que no se quede en el tablón por un descuido.
const DIAS_ANUNCIO = 30;
const caducidadDe = (a) => {
  if (a.fecha_caducidad || a.tipo === "informacion") return a.fecha_caducidad || null;
  const fecha = new Date(`${(a.fecha_publicacion ?? "").slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return null;
  fecha.setUTCDate(fecha.getUTCDate() + DIAS_ANUNCIO);
  const caduca = fecha.toISOString().slice(0, 10);
  console.warn(`  ⚠ anuncio ${a.id}: sin fecha de caducidad, caduca el ${caduca}`);
  return caduca;
};
const anuncios = (
  await Promise.all(
    (await leerColeccion("anuncios"))
      .filter((a) => a.activo !== false)
      .map(async (a) => ({
        ...a,
        fecha_caducidad: caducidadDe(a),
        galeria: (a.galeria ?? []).filter((g) => g?.imagen),
        documentos: await revisarDocumentos(`anuncio ${a.id}`, a),
      })),
  )
).sort(porFechaDesc);
// El tablón solo enseña la foto principal, y de los PDF basta saber si hay (el clip)
await escribir(
  "anuncios",
  anuncios.map((a) => ({ ...quitar(a, "galeria", "documentos"), adjuntos: a.documentos.length })),
  anuncios,
);

const anuncioPorId = new Map(anuncios.map((a) => [a.id, a]));

// Avisos de portada — la banda de arriba. Caducan solos igual que los anuncios.
// El orden importa porque se apilan: primero el mas grave, y a igual nivel el mas
// reciente (el id empieza por la fecha, asi que basta con ordenar por id).
const ORDEN_NIVEL = { urgente: 0, aviso: 1, informacion: 2 };
const nivelDe = (a) => ORDEN_NIVEL[a.nivel] ?? 9;
const avisos = (await leerColeccion("avisos"))
  .filter((a) => a.activo !== false)
  // El enlace de «Más información»: a la actividad, al anuncio del Tablón o a la
  // noticia, el primero que haya (en el CMS se pide solo uno). Si lo enlazado está
  // oculto o ya no existe, el aviso sale sin enlace en vez de roto. Del anuncio se
  // guarda además su caducidad: pasada, la web quita el enlace (enlace_hasta).
  .map((a) => {
    const quien = `aviso ${a.id}`;
    const actividad = enlaceA(a.actividad, actividadPorId, "titulo", quien);
    const anuncio = enlaceA(a.anuncio, anuncioPorId, "titulo", quien);
    const noticia = enlaceA(a.noticia, noticiaPorId, "titulo", quien);
    if ([a.actividad, a.anuncio, a.noticia].filter(Boolean).length > 1)
      console.warn(`  ⚠ ${quien}: tiene más de un enlace; se usa el primero (actividad, tablón, noticia)`);
    const enlace = actividad
      ? { enlace: `/actividades/${actividad.id}` }
      : anuncio
        ? {
            enlace: `/tablon/${anuncio.id}`,
            enlace_hasta: anuncioPorId.get(anuncio.id).fecha_caducidad ?? null,
          }
        : noticia
          ? { enlace: `/noticias/${noticia.id}` }
          : { enlace: null };
    return { ...quitar(a, "actividad", "anuncio", "noticia"), ...enlace };
  })
  .sort((a, b) => nivelDe(a) - nivelDe(b) || (b.id ?? "").localeCompare(a.id ?? ""));
await escribir("avisos", avisos, avisos);
