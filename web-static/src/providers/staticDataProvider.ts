import type { DataProvider, CrudFilter } from "@refinedev/core";

// Lee los JSON generados por scripts/build-content.mjs:
//   data/<recurso>.json       → listado completo
//   data/<recurso>/<id>.json  → detalle
// Filtros y paginación se resuelven en el navegador.

const cache = new Map<string, Promise<unknown>>();

const loadJson = <T>(baseUrl: string, path: string): Promise<T> => {
  const url = `${baseUrl}data/${path}.json`;
  if (!cache.has(url)) {
    // GitHub Pages sirve todo con max-age=600: "no-cache" obliga a revalidar con ETag
    // (304 si no ha cambiado) para que el contenido nuevo se vea nada más publicarse
    const promise = fetch(url, { cache: "no-cache" }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return response.json();
    });
    promise.catch(() => cache.delete(url));
    cache.set(url, promise);
  }
  return cache.get(url) as Promise<T>;
};

type Row = Record<string, unknown>;

// El campo puede venir anidado ("categoria.id"): las noticias traen la categoria
// entera dentro del propio registro, no solo su id.
const valorDe = (row: Row, campo: string): unknown =>
  campo
    .split(".")
    .reduce<unknown>(
      (valor, parte) =>
        valor && typeof valor === "object"
          ? (valor as Row)[parte]
          : undefined,
      row,
    );

const applyFilters = (rows: Row[], filters?: CrudFilter[]): Row[] =>
  rows.filter((row) =>
    (filters ?? []).every((f) => {
      if (!("field" in f) || f.operator !== "eq") return true;
      if (f.value === undefined || f.value === null || f.value === "") return true;
      return String(valorDe(row, f.field)) === String(f.value);
    }),
  );

// La web se publica de tarde en tarde, así que la caducidad se comprueba al visitarla.
// Pages CMS guarda la fecha sin hora ("2026-09-30"): el anuncio se ve hasta el final de ese día.
const noCaducado = (row: Row): boolean => {
  const fecha = row.fecha_caducidad;
  if (typeof fecha !== "string") return true;
  const local = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T23:59:59` : fecha;
  return new Date(local).getTime() > Date.now();
};

const readOnly = (): never => {
  throw new Error("Versión estática: solo lectura");
};

export const staticDataProvider = (baseUrl: string): DataProvider => ({
  getApiUrl: () => baseUrl,

  getList: async ({ resource, pagination, filters }) => {
    let rows = await loadJson<Row[]>(baseUrl, resource);
    if (resource === "anuncios") rows = rows.filter(noCaducado);
    rows = applyFilters(rows, filters);

    const { currentPage = 1, pageSize = 20, mode = "server" } = pagination ?? {};
    if (mode === "off") return { data: rows as never[], total: rows.length };

    const start = (currentPage - 1) * pageSize;
    return { data: rows.slice(start, start + pageSize) as never[], total: rows.length };
  },

  getOne: async ({ resource, id }) => {
    const data = await loadJson<Row>(baseUrl, `${resource}/${id}`);
    return { data: data as never };
  },

  create: readOnly,
  update: readOnly,
  deleteOne: readOnly,
});
