import { useState } from "react";
import { Button, Modal, Typography } from "antd";
import { FacebookFilled, GoogleOutlined, PictureOutlined } from "@ant-design/icons";
import { formatFecha } from "../../config";
import { haCaducado } from "../../datos";
import { useCierreConAtras } from "./useCierreConAtras";

// Las fotos de Drive se borran a los tres meses, porque el espacio no es ilimitado.
const MESES_EN_DRIVE = 3;

// El último día en que se ve el botón de Drive ("2026-10-11" → "2027-01-11"), contando
// desde `desde`. Sin fecha válida no hay hasta cuándo, y el botón no se pinta: mejor
// eso que dejar un enlace que un día dará error.
const driveHasta = (desde?: string | null): string | null => {
  const dia = desde?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dia) return null;
  const [anio, mes, d] = dia.slice(1).map(Number);
  // A fin de mes, si el día no existe se queda en el último (30 nov → 28 feb)
  const ultimo = new Date(anio, mes - 1 + MESES_EN_DRIVE + 1, 0).getDate();
  const fin = new Date(anio, mes - 1 + MESES_EN_DRIVE, Math.min(d, ultimo));
  const dosCifras = (n: number) => String(n).padStart(2, "0");
  return `${fin.getFullYear()}-${dosCifras(fin.getMonth() + 1)}-${dosCifras(fin.getDate())}`;
};

// «Ver más fotos» de una noticia o una actividad: en Facebook, en Drive o en los dos.
// Mucha gente no tiene Facebook y no puede ver el álbum, de ahí el de Drive. Antes de
// abrir Drive se avisa de hasta cuándo estarán las fotos; pasado ese día el botón se
// quita solo, al visitar, sin volver a publicar la web.
export function MasFotos({
  facebook,
  drive,
  desde,
}: {
  facebook?: string | null;
  drive?: string | null;
  /** La fecha desde la que cuentan los tres meses de Drive. */
  desde?: string | null;
}) {
  const [avisoAbierto, setAvisoAbierto] = useState(false);
  useCierreConAtras(avisoAbierto, () => setAvisoAbierto(false));

  const hasta = drive ? driveHasta(desde) : null;
  const conDrive = !!hasta && !haCaducado(hasta);
  if (!facebook && !conDrive) return null;

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
      {facebook && (
        <Button href={facebook} target="_blank" rel="noopener noreferrer" icon={<FacebookFilled />}>
          Ver más fotos en Facebook
        </Button>
      )}
      {conDrive && (
        <>
          <Button icon={<GoogleOutlined />} onClick={() => setAvisoAbierto(true)}>
            Ver más fotos en Drive
          </Button>
          <Modal
            open={avisoAbierto}
            title="Fotos disponibles por tiempo limitado"
            onCancel={() => setAvisoAbierto(false)}
            footer={[
              <Button key="cancelar" onClick={() => setAvisoAbierto(false)}>
                Cancelar
              </Button>,
              <Button
                key="ver"
                type="primary"
                href={drive!}
                target="_blank"
                rel="noopener noreferrer"
                icon={<PictureOutlined />}
                onClick={() => setAvisoAbierto(false)}
              >
                Ver las fotos
              </Button>,
            ]}
          >
            <Typography.Paragraph style={{ fontSize: 16, marginBottom: 0 }}>
              Estas fotos estarán disponibles hasta el <strong>{formatFecha(`${hasta}T00:00`)}</strong>.
              No tenemos espacio para guardarlas siempre, así que si quieres alguna,
              descárgala antes de esa fecha.
            </Typography.Paragraph>
          </Modal>
        </>
      )}
    </div>
  );
}
