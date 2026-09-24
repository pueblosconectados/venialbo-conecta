// Genera public/data/ a partir de los ficheros de content/ (editados con Pages CMS).
//
//   content/<recurso>/<slug>.json  →  public/data/<recurso>.json       (listado)
//                                     public/data/<recurso>/<slug>.json (detalle)
//
// El id de cada entrada es el nombre del fichero sin extensión. La forma de los datos
// imita la antigua API del backend para que las páginas no tengan que cambiar.

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// Comprueba los PDF de una noticia o una actividad y les añade el tamaño, para poder
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
  .sort((a, b) => porTexto("tipo")(a, b) || porTexto("nombre")(a, b));
await escribir("servicios", servicios, servicios);

// Actividades — el álbum de lo que se ha hecho. No caducan. "Organiza" y la noticia
// que la anunció se guardan como ruta del fichero referenciado: se sustituyen por lo
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
const actividades = (
  await Promise.all(
    (await leerColeccion("actividades"))
      .filter((a) => a.activa !== false)
      .map(async (a) => {
        const quien = `actividad ${a.id}`;
        return {
          ...a,
          organiza: enlaceA(a.organiza, servicioPorId, "nombre", quien),
          noticia: enlaceA(a.noticia, noticiaPorId, "titulo", quien),
          // Una fila de la galería que se quedó sin foto no pinta nada
          galeria: (a.galeria ?? []).filter((g) => g?.imagen),
          documentos: await revisarDocumentos(quien, a),
        };
      }),
  )
)
  // A igual fecha, el id (que empieza por la fecha de creación) desempata
  .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "") || b.id.localeCompare(a.id));
// El listado solo necesita la tarjeta
await escribir(
  "actividades",
  actividades.map((a) => ({
    ...quitar(a, "contenido", "documentos", "galeria", "noticia", "video_url", "album_externo"),
    fotos: a.galeria.length,
  })),
  actividades,
);

// Avisos de portada — la banda de arriba. Caducan solos igual que los anuncios.
// El orden importa porque se apilan: primero el mas grave, y a igual nivel el mas
// reciente (el id empieza por la fecha, asi que basta con ordenar por id).
const ORDEN_NIVEL = { urgente: 0, aviso: 1, informacion: 2 };
const nivelDe = (a) => ORDEN_NIVEL[a.nivel] ?? 9;
const avisos = (await leerColeccion("avisos"))
  .filter((a) => a.activo !== false)
  .map((a) => ({ ...a, noticia: a.noticia ? idDe(a.noticia) : null }))
  .sort((a, b) => nivelDe(a) - nivelDe(b) || (b.id ?? "").localeCompare(a.id ?? ""));
await escribir("avisos", avisos, avisos);

// Anuncios — los caducados se ocultan en el navegador (staticDataProvider)
const anuncios = (await leerColeccion("anuncios"))
  .filter((a) => a.activo !== false)
  .sort(porFechaDesc);
await escribir("anuncios", anuncios, anuncios);
