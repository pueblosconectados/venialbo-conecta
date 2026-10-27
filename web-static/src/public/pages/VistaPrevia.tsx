import { useEffect, type ComponentType } from "react";
import { Link, useParams } from "react-router";
import { Alert, Button, Result, Spin } from "antd";
import { BorradorContext, useOne, type Borrador } from "../../datos";
import { NoticiasShow } from "./noticias/NoticiasShow";
import { ActividadesShow } from "./actividades/ActividadesShow";
import { LugaresShow } from "./descubre/LugaresShow";
import { RutasShow } from "./descubre/RutasShow";
import { NegociosShow } from "./negocios/NegociosShow";
import { ServiciosShow } from "./servicios/ServiciosShow";
import { AnunciosShow } from "./anuncios/AnunciosShow";

// La vista previa de lo oculto: /borrador/<clave>. Lo que aún no está publicado
// (las altas y anuncios que llegan por Tally, los borradores del CMS) se pinta con la
// pantalla de su ficha, como se verá al publicarlo, con un aviso encima. El enlace lo da
// el bot de Telegram (avisos/worker/src/fichas.js); los datos los escribe
// scripts/build-content.mjs en data/borradores/<clave>.json.
//
// No es privado, solo difícil de encontrar: no sale en ningún listado, no se indexa y no
// se puede compartir desde aquí.
const PANTALLAS: Record<string, ComponentType> = {
  noticias: NoticiasShow,
  actividades: ActividadesShow,
  lugares: LugaresShow,
  rutas: RutasShow,
  negocios: NegociosShow,
  servicios: ServiciosShow,
  anuncios: AnunciosShow,
};

export function VistaPrevia() {
  const { clave } = useParams<{ clave: string }>();
  const { result, query } = useOne<Borrador>({ resource: "borradores", id: clave });

  // Que los buscadores no la guarden aunque alguien la enlace
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  if (query.isLoading) return <Spin style={{ display: "block", margin: "60px auto" }} />;

  const Pantalla = result && PANTALLAS[result.recurso];
  if (query.isError || !result || !Pantalla)
    return (
      <Result
        status="info"
        title="Esta vista previa no está"
        subTitle="Puede que aún se esté preparando (tarda unos minutos desde que llega), o que ya se haya publicado o borrado."
        extra={
          <Link to="/">
            <Button type="primary">Ir al inicio</Button>
          </Link>
        }
      />
    );

  return (
    <BorradorContext.Provider value={result}>
      <div style={{ maxWidth: 800, margin: "0 auto 16px" }}>
        <Alert
          type="warning"
          showIcon
          message="Vista previa: esto todavía no está publicado"
          description="Así se verá en la web cuando se publique. Solo lo ve quien tenga este enlace."
        />
      </div>
      <Pantalla />
    </BorradorContext.Provider>
  );
}
