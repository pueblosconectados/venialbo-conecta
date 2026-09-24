import { useState } from "react";
import { Button, Dropdown } from "antd";
import {
  CheckOutlined,
  LinkOutlined,
  MailOutlined,
  ShareAltOutlined,
  WhatsAppOutlined,
} from "@ant-design/icons";

// El botón de compartir de las fichas.
//
// En el móvil abre el menú de compartir del propio teléfono (WhatsApp, Telegram,
// correo… lo que tenga instalado), que es lo que la gente conoce. En el ordenador ese
// menú no existe o es el de Windows, que es pobre: ahí se despliegan tres opciones
// fijas. La vista previa que sale al compartir (título, texto y foto) la ponen las
// páginas que genera scripts/paginas-compartir.mjs.
const enMovil = () =>
  typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;

export const Compartir = ({ titulo }: { titulo: string }) => {
  const [copiado, setCopiado] = useState(false);
  // Sin la ?consulta ni el #ancla: el enlace limpio de la ficha
  const url = `${window.location.origin}${window.location.pathname}`;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sin permiso para el portapapeles (http, navegador viejo): que lo copie a mano
      window.prompt("Copia el enlace:", url);
    }
  };

  const boton = (
    <Button
      icon={copiado ? <CheckOutlined /> : <ShareAltOutlined />}
      onClick={
        enMovil()
          ? () =>
              // Si se cierra el menú sin elegir nada, share() falla con AbortError: no
              // es un error
              navigator.share({ title: titulo, url }).catch(() => {})
          : undefined
      }
    >
      {copiado ? "Enlace copiado" : "Compartir"}
    </Button>
  );

  if (enMovil()) return boton;

  const texto = encodeURIComponent(`${titulo} ${url}`);
  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      menu={{
        items: [
          { key: "copiar", icon: <LinkOutlined />, label: "Copiar el enlace", onClick: copiar },
          {
            key: "whatsapp",
            icon: <WhatsAppOutlined />,
            label: (
              <a href={`https://wa.me/?text=${texto}`} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            ),
          },
          {
            key: "correo",
            icon: <MailOutlined />,
            label: (
              <a href={`mailto:?subject=${encodeURIComponent(titulo)}&body=${encodeURIComponent(url)}`}>
                Correo
              </a>
            ),
          },
        ],
      }}
    >
      {boton}
    </Dropdown>
  );
};
