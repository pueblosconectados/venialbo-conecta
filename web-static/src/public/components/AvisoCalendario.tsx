import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Typography } from "antd";
import { CalendarOutlined, RightOutlined } from "@ant-design/icons";
import { listar } from "../../datos";
import { formatFechasActividad, yaCelebrada } from "../pages/actividades/categorias";

type Proxima = {
  id: string;
  titulo: string;
  fecha: string;
  fecha_fin?: string | null;
  hora?: string | null;
  hora_fin?: string | null;
};

// La franja de la portada que lleva al calendario de Actividades. Dice cuál es la
// próxima para que el enlace cuente algo; si no hay ninguna anunciada, o el listado no
// carga, la franja se queda igual pero sin ese renglón.
export function AvisoCalendario() {
  const [proxima, setProxima] = useState<Proxima | null>(null);

  useEffect(() => {
    let vigente = true;
    listar<Proxima>("actividades", { pagination: { mode: "off" } })
      .then(({ data }) => {
        // El build las ordena de la más reciente a la más antigua: la última de las
        // que no se han celebrado es la que antes llega
        const pendientes = data.filter((a) => !yaCelebrada(a));
        if (vigente) setProxima(pendientes.at(-1) ?? null);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  return (
    <Link to="/actividades?vista=calendario" className="vc-aviso-calendario">
      <span className="vc-aviso-calendario-icono" aria-hidden>
        <CalendarOutlined />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <Typography.Text strong style={{ display: "block", fontSize: 16, color: "inherit" }}>
          La agenda del pueblo, en un calendario
        </Typography.Text>
        <Typography.Text style={{ fontSize: 14, color: "inherit", opacity: 0.85 }}>
          {proxima
            ? `Próxima: ${proxima.titulo} · ${formatFechasActividad(proxima.fecha, proxima.fecha_fin, proxima.hora, proxima.hora_fin)}`
            : "Cursos, talleres, excursiones y fiestas, día a día"}
        </Typography.Text>
      </span>
      <span className="vc-aviso-calendario-boton">
        Ver el calendario <RightOutlined />
      </span>
    </Link>
  );
}
