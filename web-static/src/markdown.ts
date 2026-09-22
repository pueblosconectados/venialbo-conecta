import MarkdownIt from "markdown-it";
import { juegoDeMiniaturas } from "./miniaturas";
import { BASE_URL } from "./config";

// html: false escapa el HTML en crudo que venga en el contenido, asi que no
// hace falta sanear la salida despues: no hay forma de colar etiquetas.
// linkify convierte en enlaces las direcciones escritas a pelo, que es como
// estan en las noticias antiguas.
// breaks respeta los saltos de linea sueltos, para que el texto plano ya
// publicado se siga viendo igual que con el pre-wrap que habia antes.
const md = MarkdownIt({ html: false, linkify: true, breaks: true });

// Pages CMS inserta las imagenes como /media/imagenes/...; en GitHub Pages el
// sitio cuelga de /venialbo-conecta/, asi que las rutas absolutas necesitan el
// prefijo o dan 404.
const conBase = (url: string) =>
  url.startsWith("/") ? `${BASE_URL}${url.replace(/^\//, "")}` : url;

// attrGet declara string | number | null, de ahi el paso por String().
const atributo = (valor: string | number | null): string =>
  valor === null ? "" : String(valor);

const imagenPorDefecto = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const src = atributo(tokens[idx].attrGet("src"));
  if (src) {
    // Las imágenes que el CMS mete dentro del texto también tienen sus miniaturas
    const miniaturas = juegoDeMiniaturas(src);
    if (miniaturas) {
      tokens[idx].attrSet("srcset", miniaturas);
      tokens[idx].attrSet("sizes", "(max-width: 832px) 100vw, 800px");
    }
    tokens[idx].attrSet("src", conBase(src));
  }
  return imagenPorDefecto(tokens, idx, options, env, self);
};

const enlacePorDefecto =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = atributo(tokens[idx].attrGet("href"));
  if (/^https?:\/\//i.test(href)) {
    // Los enlaces externos salen fuera del sitio: pestaña nueva y sin dar
    // acceso al window de origen.
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener noreferrer");
  } else if (href.startsWith("/")) {
    tokens[idx].attrSet("href", conBase(href));
  }
  return enlacePorDefecto(tokens, idx, options, env, self);
};

export const renderMarkdown = (texto?: string | null): string =>
  texto ? md.render(texto) : "";

// Para los extractos de una linea de los listados: el texto sin marcas de
// formato. Se saca de los tokens de markdown-it y no con expresiones
// regulares, para que [texto](url) deje "texto" y no la direccion.
export const textoPlano = (texto?: string | null): string => {
  if (!texto) return "";
  const trozos: string[] = [];
  for (const bloque of md.parse(texto, {})) {
    for (const t of bloque.children ?? []) {
      if (t.type === "text" || t.type === "code_inline") trozos.push(t.content);
      else if (t.type === "softbreak" || t.type === "hardbreak") trozos.push(" ");
    }
    // Separar parrafos, elementos de lista, etc.
    if (bloque.block && bloque.nesting === -1) trozos.push(" ");
  }
  return trozos.join("").replace(/\s+/g, " ").trim();
};
