// Lo que el Worker le pide a GitHub, con GITHUB_TOKEN: un token de grano fino solo para
// este repositorio, con "Actions: Read and write" (lanzar los workflows de traer y ver
// cuáles fallan) y "Contents: Read" (leer tally/respuestas-importadas.json sin la caché
// de raw).

const REPO = "pueblosconectados/venialbo-conecta";
const API = `https://api.github.com/repos/${REPO}`;

// Los workflows que traen las respuestas de Tally al CMS, los mismos de los botones de
// Pages CMS. Los dos importan todo lo pendiente (--todas), así que lanzarlos de más no
// duplica nada, y su `concurrency` evita que dos a la vez se pisen al commitear.
export const TRAER = {
  negocios: { workflow: "altas-negocio.yml", texto: "las altas de negocio", ocultos: "ocultas" },
  tablon: { workflow: "anuncios-tablon.yml", texto: "los anuncios del tablón", ocultos: "ocultos" },
};

const cabeceras = (env) => ({
  authorization: `Bearer ${env.GITHUB_TOKEN}`,
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  // GitHub rechaza las peticiones sin User-Agent
  "user-agent": "venialbo-avisos",
});

// true si GitHub aceptó lanzarlo (responde 204)
export const lanzarTraer = async (env, cual) => {
  const { workflow } = TRAER[cual];
  const respuesta = await fetch(`${API}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: { ...cabeceras(env), "content-type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { payload: "" } }),
  });
  return respuesta.status === 204;
};

// { negocios: [ids...], tablon: [ids...] }, lo que ya está pasado al CMS
export const leerImportadas = async (env) => {
  const respuesta = await fetch(`${API}/contents/tally/respuestas-importadas.json?ref=main`, {
    headers: { ...cabeceras(env), accept: "application/vnd.github.raw+json" },
  });
  if (!respuesta.ok) throw new Error(`GitHub: HTTP ${respuesta.status} al leer respuestas-importadas.json`);
  const datos = await respuesta.json();
  // La primera versión era una lista suelta de negocios (ver tally/comun.mjs)
  return Array.isArray(datos) ? { negocios: datos } : datos;
};

// Las últimas ejecuciones de todos los workflows, de la más nueva a la más vieja. null si
// GitHub rechaza el token (caducado o sin permiso); error si falla otra cosa.
export const listarEjecuciones = async (env) => {
  const respuesta = await fetch(`${API}/actions/runs?per_page=50`, { headers: cabeceras(env) });
  if (respuesta.status === 401 || respuesta.status === 403) return null;
  if (!respuesta.ok) throw new Error(`GitHub: HTTP ${respuesta.status} al listar las ejecuciones`);
  return (await respuesta.json()).workflow_runs;
};
