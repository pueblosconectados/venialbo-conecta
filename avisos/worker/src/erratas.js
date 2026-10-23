// POST /erratas: las posibles faltas de lo último guardado en el CMS, que revisa
// avisos/erratas.mjs desde la Action y manda aquí para que lleguen al grupo. El mensaje
// viene ya hecho; aquí solo se comprueba que tiene buena pinta y que los botones llevan
// al CMS y a ningún otro sitio.

import { aTelegram } from "./telegram.js";

const CMS = "https://app.pagescms.org/pueblosconectados/venialbo-conecta/";
const MAX_TEXTO = 4096; // lo que admite Telegram
const MAX_BOTONES = 10;

export const mandarErratas = async (cuerpo, env) => {
  const { texto, botones = [] } = cuerpo ?? {};
  if (typeof texto !== "string" || !texto.trim() || texto.length > MAX_TEXTO) return { error: "texto no válido" };
  const validos =
    Array.isArray(botones) &&
    botones.length <= MAX_BOTONES &&
    botones.every(
      (fila) =>
        Array.isArray(fila) &&
        fila.every((b) => typeof b?.text === "string" && b.text.length <= 64 && typeof b.url === "string" && b.url.startsWith(CMS)),
    );
  if (!validos) return { error: "botones no válidos" };
  return (await aTelegram(env, texto, botones)) ? { ok: true } : { error: "Telegram no lo ha aceptado" };
};
