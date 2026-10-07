import { useEffect, useState } from "react";
import { Card, Typography } from "antd";
import { colors } from "../../theme";

// El tiempo en Venialbo, de Open-Meteo: gratis, sin clave y admite llamadas desde el
// navegador, así que cada visitante lo pide al cargar la portada y siempre está al día.
// Si falla, la tarjeta no sale y la portada sigue igual.
const API =
  "https://api.open-meteo.com/v1/forecast?latitude=41.3896&longitude=-5.536" +
  "&current=temperature_2m,weather_code,is_day" +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
  "&timezone=Europe%2FMadrid&forecast_days=4";

const AEMET = "https://www.aemet.es/es/eltiempo/prediccion/municipios/venialbo-id49234";

type Respuesta = {
  current: { temperature_2m: number; weather_code: number; is_day: number };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
};

// Los códigos WMO que devuelve Open-Meteo, agrupados en lo que interesa en el pueblo
function describir(codigo: number, deDia = true): { icono: string; texto: string } {
  if (codigo === 0) return { icono: deDia ? "☀️" : "🌙", texto: "Despejado" };
  if (codigo <= 2) return { icono: deDia ? "🌤️" : "☁️", texto: "Poco nuboso" };
  if (codigo === 3) return { icono: "☁️", texto: "Nublado" };
  if (codigo <= 48) return { icono: "🌫️", texto: "Niebla" };
  if (codigo <= 57) return { icono: "🌦️", texto: "Llovizna" };
  if (codigo <= 67) return { icono: "🌧️", texto: "Lluvia" };
  if (codigo <= 77) return { icono: "🌨️", texto: "Nieve" };
  if (codigo <= 82) return { icono: "🌦️", texto: "Chubascos" };
  if (codigo <= 86) return { icono: "🌨️", texto: "Chubascos de nieve" };
  return { icono: "⛈️", texto: "Tormenta" };
}

const diaCorto = (fecha: string) =>
  new Date(`${fecha}T12:00:00`).toLocaleDateString("es-ES", { weekday: "short" });

export function ElTiempo() {
  const [datos, setDatos] = useState<Respuesta | null>(null);

  useEffect(() => {
    const control = new AbortController();
    fetch(API, { signal: control.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setDatos)
      .catch(() => {});
    return () => control.abort();
  }, []);

  if (!datos) return null;

  const { current: ahora, daily: d } = datos;
  const hoy = describir(ahora.weather_code, ahora.is_day === 1);

  return (
    <Card
      styles={{ body: { padding: "18px 24px" } }}
      style={{ border: `1px solid ${colors.borde}`, marginBottom: 40 }}
    >
      <div className="vc-tiempo">
        <div className="vc-tiempo-ahora">
          <span style={{ fontSize: 40, lineHeight: 1 }} aria-hidden>
            {hoy.icono}
          </span>
          <div>
            <Typography.Text style={{ fontSize: 13, color: colors.marronSuave, display: "block" }}>
              Ahora en Venialbo
            </Typography.Text>
            <span style={{ fontSize: 28, fontWeight: 600, color: colors.marronTexto }}>
              {Math.round(ahora.temperature_2m)}°
            </span>{" "}
            <Typography.Text style={{ color: colors.marronSuave }}>{hoy.texto}</Typography.Text>
            <Typography.Text style={{ fontSize: 13, color: colors.marronSuave, display: "block" }}>
              Hoy {Math.round(d.temperature_2m_max[0])}° / {Math.round(d.temperature_2m_min[0])}°
              {d.precipitation_probability_max[0] >= 20 &&
                ` · 💧 ${d.precipitation_probability_max[0]} %`}
            </Typography.Text>
          </div>
        </div>

        <div className="vc-tiempo-dias">
          {d.time.slice(1).map((fecha, i) => {
            const dia = describir(d.weather_code[i + 1]);
            return (
              <div key={fecha} title={dia.texto} style={{ textAlign: "center", minWidth: 56 }}>
                <div style={{ fontSize: 13, color: colors.marronSuave, textTransform: "capitalize" }}>
                  {diaCorto(fecha)}
                </div>
                <div style={{ fontSize: 24, lineHeight: 1.4 }} aria-label={dia.texto}>
                  {dia.icono}
                </div>
                <div style={{ fontSize: 13, color: colors.marronTexto }}>
                  {Math.round(d.temperature_2m_max[i + 1])}°{" "}
                  <span style={{ color: colors.marronSuave }}>
                    {Math.round(d.temperature_2m_min[i + 1])}°
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <a
        href={AEMET}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "block", marginTop: 10, fontSize: 12, color: colors.musgo }}
      >
        Predicción completa en AEMET →
      </a>
    </Card>
  );
}
