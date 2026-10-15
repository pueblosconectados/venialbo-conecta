import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Button, Grid, Tag, Typography } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { colors, softTagStyle, tagTones } from "../../../theme";
import { categoriaActividad, formatFechasActividad, yaCelebrada } from "./categorias";

export type ActividadCalendario = {
  id: string;
  titulo: string;
  fecha: string;
  fecha_fin?: string | null;
  categoria: string;
};

// Una actividad de pocos días se marca en todos ellos; una larga (una exposición de
// dos meses, un curso de todo el año) llenaría el mes de puntos, así que solo se marcan
// el día que empieza y el que acaba. En la lista del mes sale igualmente.
const MAX_DIAS_SEGUIDOS = 14;
const DIA_MS = 86_400_000;
const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];
const EN_CELDA = 2;

const dos = (n: number) => String(n).padStart(2, "0");
const isoDe = (y: number, m: number, d: number) => `${y}-${dos(m + 1)}-${dos(d)}`;
// Las cuentas de días en UTC, para que el cambio de hora no se coma ni repita ninguno
const msDe = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const isoDeMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const intervalo = (a: ActividadCalendario) => {
  const inicio = a.fecha.slice(0, 10);
  const fin = a.fecha_fin?.slice(0, 10);
  return { inicio, fin: fin && fin > inicio ? fin : inicio };
};

const diasMarcados = (a: ActividadCalendario): string[] => {
  const { inicio, fin } = intervalo(a);
  const desde = msDe(inicio);
  const hasta = msDe(fin);
  if ((hasta - desde) / DIA_MS >= MAX_DIAS_SEGUIDOS) return [inicio, fin];
  const dias = [];
  for (let t = desde; t <= hasta; t += DIA_MS) dias.push(isoDeMs(t));
  return dias;
};

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fechaLocal = (iso: string) => new Date(`${iso}T12:00:00`);
const hoyIso = () => {
  const h = new Date();
  return isoDe(h.getFullYear(), h.getMonth(), h.getDate());
};

export function CalendarioActividades({ actividades }: { actividades: ActividadCalendario[] }) {
  const amplio = !!Grid.useBreakpoint().md;
  const hoy = hoyIso();
  const [mes, setMes] = useState({ y: +hoy.slice(0, 4), m: +hoy.slice(5, 7) - 1 });
  const [dia, setDia] = useState<string | null>(null);

  // Día → actividades de ese día, de la que empieza antes a la que empieza después
  const porDia = useMemo(() => {
    const mapa = new Map<string, ActividadCalendario[]>();
    const ordenadas = [...actividades].sort((a, b) => a.fecha.localeCompare(b.fecha));
    for (const a of ordenadas)
      for (const d of diasMarcados(a)) mapa.set(d, [...(mapa.get(d) ?? []), a]);
    return mapa;
  }, [actividades]);

  const diasDelMes = new Date(mes.y, mes.m + 1, 0).getDate();
  const primero = isoDe(mes.y, mes.m, 1);
  const ultimo = isoDe(mes.y, mes.m, diasDelMes);
  // La semana empieza en lunes: getDay() da 0 al domingo
  const huecos = (new Date(mes.y, mes.m, 1).getDay() + 6) % 7;
  const celdas: (string | null)[] = [
    ...Array<null>(huecos).fill(null),
    ...Array.from({ length: diasDelMes }, (_, i) => isoDe(mes.y, mes.m, i + 1)),
  ];
  while (celdas.length % 7) celdas.push(null);

  const cambiarMes = (salto: number) => {
    const d = new Date(mes.y, mes.m + salto, 1);
    setMes({ y: d.getFullYear(), m: d.getMonth() });
    setDia(null);
  };
  const irAHoy = () => {
    setMes({ y: +hoy.slice(0, 4), m: +hoy.slice(5, 7) - 1 });
    setDia(null);
  };

  const nombreMes = mayuscula(
    new Date(mes.y, mes.m, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
  );
  const esteMes = mes.y === +hoy.slice(0, 4) && mes.m === +hoy.slice(5, 7) - 1;

  // Debajo: las del día elegido o, si no hay día elegido, todas las que tocan el mes
  // (también las largas que empezaron antes y acaban después)
  const lista = dia
    ? (porDia.get(dia) ?? [])
    : actividades
        .filter((a) => {
          const { inicio, fin } = intervalo(a);
          return inicio <= ultimo && fin >= primero;
        })
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo));
  const tituloLista = dia
    ? mayuscula(fechaLocal(dia).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }))
    : `En ${nombreMes.split(" ")[0].toLowerCase()}`;

  return (
    <div>
      <div className="vc-cal-cabecera">
        <Button
          type="text"
          icon={<LeftOutlined />}
          onClick={() => cambiarMes(-1)}
          aria-label="Mes anterior"
        />
        <Typography.Title level={4} style={{ margin: 0, flex: 1, textAlign: "center" }}>
          {nombreMes}
        </Typography.Title>
        <Button
          type="text"
          icon={<RightOutlined />}
          onClick={() => cambiarMes(1)}
          aria-label="Mes siguiente"
        />
      </div>

      <div className="vc-cal" role="grid" aria-label={`Actividades de ${nombreMes}`}>
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="vc-cal-semana" role="columnheader">
            {d}
          </div>
        ))}
        {celdas.map((iso, i) => {
          if (!iso) return <div key={`h${i}`} className="vc-cal-celda vc-cal-hueco" />;
          const delDia = porDia.get(iso) ?? [];
          const clases = [
            "vc-cal-celda",
            iso === hoy && "vc-cal-hoy",
            iso === dia && "vc-cal-elegido",
            iso < hoy && "vc-cal-pasado",
            delDia.length > 0 && "vc-cal-con",
          ]
            .filter(Boolean)
            .join(" ");
          const numero = +iso.slice(8);
          const etiqueta =
            `${numero} de ${nombreMes.split(" ")[0].toLowerCase()}` +
            (delDia.length
              ? `, ${delDia.length} ${delDia.length === 1 ? "actividad" : "actividades"}`
              : "");
          return (
            <div key={iso} className={clases} role="gridcell" onClick={() => setDia(iso === dia ? null : iso)}>
              <button type="button" className="vc-cal-numero" aria-label={etiqueta} aria-pressed={iso === dia}>
                {numero}
              </button>
              {amplio ? (
                <>
                  {delDia.slice(0, EN_CELDA).map((a) => {
                    const tono = tagTones[categoriaActividad(a.categoria).tono];
                    return (
                      <Link
                        key={a.id}
                        to={`/actividades/${a.id}`}
                        className="vc-cal-evento"
                        style={{ background: tono.bg, color: tono.color }}
                        title={a.titulo}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {a.titulo}
                      </Link>
                    );
                  })}
                  {delDia.length > EN_CELDA && (
                    <span className="vc-cal-mas">+{delDia.length - EN_CELDA} más</span>
                  )}
                </>
              ) : (
                delDia.length > 0 && (
                  <span className="vc-cal-puntos" aria-hidden>
                    {delDia.slice(0, 3).map((a) => (
                      <span
                        key={a.id}
                        style={{ background: tagTones[categoriaActividad(a.categoria).tono].color }}
                      />
                    ))}
                  </span>
                )
              )}
            </div>
          );
        })}
      </div>

      <div className="vc-cal-pie">
        <Typography.Title level={5} style={{ margin: 0 }}>
          {tituloLista}
        </Typography.Title>
        {dia ? (
          <Button type="link" onClick={() => setDia(null)} style={{ padding: 0 }}>
            Ver todo el mes
          </Button>
        ) : (
          !esteMes && (
            <Button type="link" onClick={irAHoy} style={{ padding: 0 }}>
              Volver a hoy
            </Button>
          )
        )}
      </div>

      {lista.length === 0 ? (
        <Typography.Paragraph style={{ color: colors.marronSuave }}>
          {dia ? "No hay nada anunciado este día." : "No hay nada anunciado este mes."}
        </Typography.Paragraph>
      ) : (
        <ul className="vc-cal-lista">
          {lista.map((a) => {
            const cat = categoriaActividad(a.categoria);
            const f = fechaLocal(a.fecha.slice(0, 10));
            return (
              <li key={a.id}>
                <Link
                  to={`/actividades/${a.id}`}
                  className={`vc-cal-fila${yaCelebrada(a) ? " vc-cal-fila-pasada" : ""}`}
                >
                  <span className="vc-cal-fecha" style={softTagStyle(cat.tono)}>
                    <strong>{f.getDate()}</strong>
                    {f.toLocaleDateString("es-ES", { month: "short" }).replace(".", "")}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <Typography.Text strong style={{ display: "block" }}>
                      {a.titulo}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      {formatFechasActividad(a.fecha, a.fecha_fin)}
                      {yaCelebrada(a) && " · Ya celebrada"}
                    </Typography.Text>
                    <span style={{ display: "block", marginTop: 4 }}>
                      <Tag style={softTagStyle(cat.tono)}>
                        {cat.icono} {cat.nombre}
                      </Tag>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
