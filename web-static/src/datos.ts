// Lee los JSON generados por scripts/build-content.mjs:
//   data/<recurso>.json       → listado completo
//   data/<recurso>/<id>.json  → detalle
// Filtros, paginación y caducidad se resuelven en el navegador.
//
// Esto era un data provider de Refine. Se quitó Refine el 2026-09-22 porque costaba
// 240 KB del bundle —con react-query, un lector de CSV y un motor de Markdown que no
// usábamos— para dar dos hooks. La lógica de datos siempre fue nuestra; lo único que
// había que escribir eran los hooks, que son las 40 últimas líneas de este fichero.

import { useEffect, useState } from "react";
import { BASE_URL } from "./config";

type Fila = Record<string, unknown>;

export type Filtro = { field: string; operator: "eq"; value: unknown };
export type Paginacion =
  | { mode: "off" }
  | { mode?: "server"; currentPage?: number; pageSize?: number };

const cache = new Map<string, Promise<unknown>>();

const cargarJson = <T,>(ruta: string): Promise<T> => {
  const url = `${BASE_URL}data/${ruta}.json`;
  if (!cache.has(url)) {
    // GitHub Pages sirve todo con max-age=600: "no-cache" obliga a revalidar con ETag
    // (304 si no ha cambiado) para que el contenido nuevo se vea nada más publicarse
    const promesa = fetch(url, { cache: "no-cache" }).then((respuesta) => {
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}: ${url}`);
      return respuesta.json();
    });
    promesa.catch(() => cache.delete(url));
    cache.set(url, promesa);
  }
  return cache.get(url) as Promise<T>;
};

// El campo puede venir anidado ("categoria.id"): las noticias traen la categoria
// entera dentro del propio registro, no solo su id.
const valorDe = (fila: Fila, campo: string): unknown =>
  campo
    .split(".")
    .reduce<unknown>(
      (valor, parte) =>
        valor && typeof valor === "object" ? (valor as Fila)[parte] : undefined,
      fila,
    );

const aplicarFiltros = (filas: Fila[], filtros?: Filtro[]): Fila[] =>
  filas.filter((fila) =>
    (filtros ?? []).every((f) => {
      if (f.operator !== "eq") return true;
      if (f.value === undefined || f.value === null || f.value === "") return true;
      return String(valorDe(fila, f.field)) === String(f.value);
    }),
  );

// Recursos cuyas fichas desaparecen solas al pasar su fecha de caducidad.
const CADUCAN = new Set(["anuncios", "avisos"]);

// La web se publica de tarde en tarde, así que la caducidad se comprueba al visitarla.
// Pages CMS guarda la fecha sin hora ("2026-09-30"): el anuncio se ve hasta el final de ese día.
// Se exporta porque el listado no es el único sitio que la necesita: a la ficha se puede
// llegar por enlace directo, sin pasar por el listado que ya filtra.
export const haCaducado = (fecha?: string | null): boolean => {
  if (typeof fecha !== "string" || fecha === "") return false;
  const local = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T23:59:59` : fecha;
  return new Date(local).getTime() <= Date.now();
};

const noCaducado = (fila: Fila): boolean =>
  !haCaducado(typeof fila.fecha_caducidad === "string" ? fila.fecha_caducidad : null);

export const listar = async <T,>(
  recurso: string,
  opciones: { pagination?: Paginacion; filters?: Filtro[] } = {},
): Promise<{ data: T[]; total: number }> => {
  let filas = await cargarJson<Fila[]>(recurso);
  if (CADUCAN.has(recurso)) filas = filas.filter(noCaducado);
  filas = aplicarFiltros(filas, opciones.filters);

  const paginacion = opciones.pagination ?? {};
  if (paginacion.mode === "off") return { data: filas as T[], total: filas.length };

  const { currentPage = 1, pageSize = 20 } = paginacion as {
    currentPage?: number;
    pageSize?: number;
  };
  const desde = (currentPage - 1) * pageSize;
  return { data: filas.slice(desde, desde + pageSize) as T[], total: filas.length };
};

export const obtener = <T,>(recurso: string, id: string): Promise<T> =>
  cargarJson<T>(`${recurso}/${id}`);

// ── Los hooks ────────────────────────────────────────────────────────────────
//
// Misma forma que tenían los de Refine ({ result, query }), para no tocar las
// pantallas: `result` son los datos y `query` dice si está cargando o ha fallado.

type Estado<T> = { result?: T; query: { isLoading: boolean; isError: boolean } };

// Lo guardado lleva la clave de la petición que lo trajo. Si la clave de ahora no es
// esa, es que los parámetros han cambiado y lo que hay es de la petición anterior: se
// considera "cargando" sin tener que tocar el estado al entrar en el efecto, que
// provocaría un render de más.
type Guardado<T> = { clave?: string; result?: T; fallo?: boolean };

const usePeticion = <T,>(traer: () => Promise<T>, clave: string): Estado<T> => {
  const [guardado, setGuardado] = useState<Guardado<T>>({});

  useEffect(() => {
    let vivo = true;
    traer().then(
      (result) => vivo && setGuardado({ clave, result }),
      () => vivo && setGuardado({ clave, fallo: true }),
    );
    // Al cambiar de página o de filtro se descarta lo que llegue tarde
    return () => {
      vivo = false;
    };
    // `clave` resume los parámetros: mientras no cambien, no se vuelve a pedir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const alDia = guardado.clave === clave;
  return {
    result: alDia ? guardado.result : undefined,
    query: { isLoading: !alDia, isError: alDia && guardado.fallo === true },
  };
};

export const useList = <T,>(opciones: {
  resource: string;
  pagination?: Paginacion;
  filters?: Filtro[];
}): Estado<{ data: T[]; total: number }> =>
  usePeticion(
    () => listar<T>(opciones.resource, opciones),
    JSON.stringify([opciones.resource, opciones.pagination, opciones.filters]),
  );

export const useOne = <T,>(opciones: {
  resource: string;
  id?: string;
}): Estado<T> =>
  usePeticion(
    () => obtener<T>(opciones.resource, opciones.id ?? ""),
    JSON.stringify([opciones.resource, opciones.id]),
  );
