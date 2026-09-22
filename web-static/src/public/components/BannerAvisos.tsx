import { useState } from "react";
import { Link } from "react-router";
import { Alert } from "antd";
import { useList } from "../../datos";

type Aviso = {
  id: string;
  titulo: string;
  nivel?: "urgente" | "aviso" | "informacion";
  // Id de la noticia relacionada, o null. El build ya lo deja resuelto.
  noticia?: string | null;
};

// El color lo pone el nivel que eligio quien publica.
const TIPO: Record<string, "error" | "warning" | "success"> = {
  urgente: "error",
  aviso: "warning",
  informacion: "success",
};

const CLAVE = "vc-avisos-cerrados";

// Se guardan los ids cerrados, no un simple "ya los vio": asi un aviso nuevo vuelve
// a aparecer aunque el vecino cerrara el anterior.
//
// Todo va entre try/catch porque en navegacion privada, o con las cookies de sitio
// bloqueadas, leer o escribir localStorage lanza. Si falla, el aviso simplemente se
// vuelve a ver: es el fallo menos grave posible.
const leerCerrados = (): string[] => {
  try {
    const guardado = localStorage.getItem(CLAVE);
    const ids: unknown = guardado ? JSON.parse(guardado) : [];
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
};

const guardarCerrados = (ids: string[]) => {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(ids));
  } catch {
    // Sin memoria: el aviso volvera a salir en la proxima visita
  }
};

// La banda de avisos que sale en todas las paginas, bajo la cabecera. Los caducados
// los descarta ya el staticDataProvider, asi que aqui solo llegan los vigentes.
export const BannerAvisos = () => {
  const [cerrados, setCerrados] = useState<string[]>(leerCerrados);

  const { result } = useList<Aviso>({
    resource: "avisos",
    pagination: { mode: "off" },
  });

  const avisos = (result?.data ?? []).filter((a) => !cerrados.includes(a.id));
  if (avisos.length === 0) return null;

  const cerrar = (id: string) => {
    const actualizados = [...cerrados, id];
    setCerrados(actualizados);
    guardarCerrados(actualizados);
  };

  return (
    // Mismo ancho y margenes que el <Content> del layout, para que la banda quede
    // alineada con el contenido de la pagina.
    <div
      style={{ maxWidth: 1200, width: "100%", margin: "0 auto", padding: "16px 16px 0" }}
    >
      {avisos.map((aviso) => (
        <Alert
          key={aviso.id}
          type={TIPO[aviso.nivel ?? "aviso"] ?? "warning"}
          // El enlace va dentro del texto y no en `action`: asi baja de linea cuando
          // no cabe, en vez de robarle el ancho al aviso en una pantalla estrecha.
          message={
            <>
              {aviso.titulo}
              {aviso.noticia && (
                <>
                  {" "}
                  <Link
                    to={`/noticias/${aviso.noticia}`}
                    style={{ whiteSpace: "nowrap", fontWeight: 600 }}
                  >
                    Más información
                  </Link>
                </>
              )}
            </>
          }
          showIcon
          closable
          onClose={() => cerrar(aviso.id)}
          style={{ marginBottom: 8 }}
        />
      ))}
    </div>
  );
};
