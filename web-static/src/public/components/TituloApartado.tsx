import type { ReactNode } from "react";
import { colors, fonts } from "../../theme";

// Los apartados dentro de una página (los grupos de Enlaces, los tipos de Servicios, las
// próximas y las ya celebradas de Actividades…). Antes cada página pintaba un Title
// suelto y los apartados se confundían entre sí: ahora cada uno va en su recuadro de
// fondo crema oscuro, con una barra junto al título.
export function Apartado(props: {
  titulo?: ReactNode;
  // Opcional: una línea debajo que diga qué hay en el apartado
  subtitulo?: ReactNode;
  // Opcional: un filtro o un botón, a la derecha del título (debajo en el móvil)
  accion?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        background: colors.cremaOscuro,
        borderRadius: 12,
        padding: "18px 16px 20px",
        marginBottom: 24,
      }}
    >
      {props.titulo && (
        <header style={{ marginBottom: 16 }}>
          <div className="vc-cabecera-lista" style={{ marginBottom: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                aria-hidden
                style={{
                  width: 5,
                  alignSelf: "stretch",
                  minHeight: 26,
                  borderRadius: 3,
                  background: colors.musgo,
                }}
              />
              <h3
                style={{
                  margin: 0,
                  fontFamily: fonts.serif,
                  fontSize: 22,
                  fontWeight: 600,
                  lineHeight: 1.25,
                  color: colors.marronTexto,
                }}
              >
                {props.titulo}
              </h3>
            </div>
            {props.accion}
          </div>
          {props.subtitulo && (
            <p style={{ margin: "6px 0 0 17px", color: colors.marronSuave, fontSize: 15 }}>
              {props.subtitulo}
            </p>
          )}
        </header>
      )}
      {props.children}
    </section>
  );
}
