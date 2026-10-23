// El buscador de la web. El índice lo genera scripts/build-content.mjs
// (data/buscador.json) con el texto de cada ficha ya sin tildes ni mayúsculas; aquí
// solo se compara. Mismas reglas que el /buscar del bot (avisos/worker/src/buscar.js):
// por el principio de las palabras ("toca" encuentra "Toca" y "tocar", no
// "autocaravanas"); con varias, tienen que estar todas; primero las que coinciden en
// el título. Lo caducado no sale, igual que en los listados.

import { haCaducado } from "./datos";

export type Entrada = {
  recurso: string;
  id: string;
  titulo: string;
  resumen: string;
  imagen: string | null;
  fecha_caducidad: string | null;
  texto: string;
};

const normaliza = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const palabrasDe = (texto: string): string[] => normaliza(texto).split(/[^a-z0-9]+/).filter(Boolean);

// Las palabras de una letra («a», «y») encontrarían casi todo
export const palabrasDeConsulta = (consulta: string): string[] =>
  palabrasDe(consulta).filter((p) => p.length > 1);

export const buscar = (entradas: Entrada[], consulta: string): Entrada[] => {
  const palabras = palabrasDeConsulta(consulta);
  if (!palabras.length) return [];
  const esta = (lista: string[], p: string) => lista.some((w) => w.startsWith(p));

  return entradas
    .filter((e) => !haCaducado(e.fecha_caducidad))
    .map((e, orden) => {
      const delTitulo = palabrasDe(e.titulo);
      const todas = [...delTitulo, ...palabrasDe(e.texto)];
      if (!palabras.every((p) => esta(todas, p))) return null;
      return { e, orden, puntos: palabras.filter((p) => esta(delTitulo, p)).length };
    })
    .filter((r) => r !== null)
    // A igualdad, el orden del índice, que es el de cada listado
    .sort((a, b) => b.puntos - a.puntos || a.orden - b.orden)
    .map((r) => r.e);
};
