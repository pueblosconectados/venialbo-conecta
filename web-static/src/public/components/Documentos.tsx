import { Space, Typography } from "antd";
import { FilePdfOutlined } from "@ant-design/icons";
import { imgUrl } from "../../config";
import { colors } from "../../theme";

export type Documento = {
  archivo: string;
  titulo?: string | null;
  /** Lo añade build-content.mjs al comprobar el PDF. */
  tamano?: number;
};

// El nombre del fichero, para cuando el documento no lleva título puesto.
const nombreDeArchivo = (ruta: string) =>
  decodeURIComponent(ruta.split("/").pop() ?? ruta);

const formatTamano = (bytes?: number) => {
  if (!bytes) return null;
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
    : `${Math.round(bytes / 1024)} KB`;
};

// Los PDF adjuntos de una noticia o una actividad, con lo que pesa cada uno.
export const Documentos = ({ documentos }: { documentos?: Documento[] }) => {
  if (!documentos?.length) return null;

  return (
    <div style={{ margin: "28px 0" }}>
      <Typography.Title level={4} style={{ marginBottom: 12 }}>
        Documentos
      </Typography.Title>
      <Space direction="vertical" size={8} style={{ display: "flex" }}>
        {documentos.map((d) => {
          const peso = formatTamano(d.tamano);
          return (
            <a
              key={d.archivo}
              href={imgUrl(d.archivo)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                background: colors.crema,
                border: `1px solid ${colors.borde}`,
                borderRadius: 10,
                color: colors.marronTexto,
              }}
            >
              <FilePdfOutlined style={{ fontSize: 20, color: colors.terracota }} />
              <span style={{ fontWeight: 500 }}>
                {d.titulo || nombreDeArchivo(d.archivo)}
              </span>
              <span style={{ color: colors.marronSuave, fontSize: 13 }}>
                PDF{peso ? ` · ${peso}` : ""}
              </span>
            </a>
          );
        })}
      </Space>
    </div>
  );
};
