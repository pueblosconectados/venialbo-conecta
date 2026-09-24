import { Link } from "react-router";
import { Divider, Typography } from "antd";
import { CONTACTO_EMAIL, FORMULARIOS } from "../../config";
import { colors } from "../../theme";

// Aviso de privacidad. Está escrito a mano y no sale del CMS a propósito: cambia muy de
// tarde en tarde y conviene que quede en el repositorio, con su historial de cambios.
// Si se cambia algo de cómo se tratan los datos (otro servicio de formularios, otro
// plazo), hay que actualizar también este texto y la fecha de abajo.
const ACTUALIZADO = "24 de septiembre de 2026";

export function Privacidad() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <Typography.Title level={2}>Privacidad</Typography.Title>
      <Typography.Text style={{ color: colors.marronSuave }}>
        Actualizado el {ACTUALIZADO}
      </Typography.Text>
      <Divider style={{ borderColor: colors.borde }} />

      <div className="vc-md">
        <p>
          Esta página explica, en cristiano, qué pasa con tus datos cuando nos escribes o
          nos mandas un anuncio. Si algo no te cuadra, pregúntanos y te lo contamos.
        </p>

        <h3>Quién recibe tus datos</h3>
        <p>
          <strong>Venialbo Conecta</strong>, que es quien mantiene esta web. Para
          cualquier cosa relacionada con tus datos, escribe a{" "}
          <a href={`mailto:${CONTACTO_EMAIL}`}>{CONTACTO_EMAIL}</a>.
        </p>

        <h3>Qué recogemos y para qué</h3>
        <p>
          Solo lo que tú escribes en uno de nuestros{" "}
          <a href={FORMULARIOS.contacto} target="_blank" rel="noopener noreferrer">
            formularios
          </a>
          : tu nombre, tu correo o tu teléfono si los pones, lo que nos cuentes y las
          fotos o archivos que adjuntes. Lo usamos para una sola cosa: contestarte, o
          publicar en la web el anuncio o el negocio que nos pides que publiquemos. No
          mandamos publicidad, no cedemos nada a nadie y no vendemos datos.
        </p>

        <h3>Qué se publica y qué no</h3>
        <p>
          En el tablón de anuncios se publica lo que escribes en el anuncio, incluido el
          teléfono o la forma de contacto que pongas en ese campo, porque de eso se trata:
          de que te puedan localizar. Lo que <strong>no</strong> se publica es el nombre
          que nos das para saber quién manda el anuncio. Nada se publica solo: lo subimos
          nosotros a mano, y antes lo leemos.
        </p>

        <h3>Fotos de las actividades</h3>
        <p>
          En <Link to="/actividades">Actividades</Link> publicamos fotos de lo que se
          hace en el pueblo, y en ellas sale gente. No subimos fotos en las que se
          reconozca a menores, salvo con permiso de sus padres o tutores. Si sales en
          alguna y prefieres que la quitemos, escríbenos a{" "}
          <a href={`mailto:${CONTACTO_EMAIL}`}>{CONTACTO_EMAIL}</a> y la quitamos sin
          preguntar.
        </p>

        <h3>Dónde se guardan</h3>
        <p>
          Los formularios los lleva <strong>Tally</strong>, una empresa belga, y las
          respuestas se guardan en sus servidores, dentro de la Unión Europea. La web en
          sí está publicada en GitHub Pages.
        </p>

        <h3>Cuánto tiempo</h3>
        <p>
          Las respuestas se guardan mientras hagan falta para lo que nos las mandaste, y
          las vamos borrando cuando ya no sirven. Si quieres que borremos algo antes,
          dilo y se borra.
        </p>

        <h3>Tus derechos</h3>
        <p>
          Puedes pedirnos ver lo que tenemos tuyo, corregirlo o borrarlo, incluido un
          anuncio ya publicado. Escribe a{" "}
          <a href={`mailto:${CONTACTO_EMAIL}`}>{CONTACTO_EMAIL}</a> y lo hacemos.
        </p>

        <h3>Cookies</h3>
        <p>
          Esta web no lleva analítica, ni rastreadores, ni cookies de publicidad. Lo único
          que guarda tu navegador es qué avisos de la banda superior has cerrado, para no
          volver a enseñártelos; eso se queda en tu móvil o tu ordenador y no llega a
          nosotros. Los vídeos de YouTube no se cargan hasta que pulsas para verlos, y a
          partir de ahí se rigen por las normas de Google. Los mapas de los lugares son de
          OpenStreetMap: al abrir uno, tu navegador le pide el mapa a sus servidores,
          como con cualquier imagen. Los formularios de Tally, al
          abrirlos, se rigen por{" "}
          <a
            href="https://tally.so/help/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            su propia política
          </a>
          .
        </p>
      </div>

      <div style={{ marginTop: 28 }}>
        <Link to="/" style={{ color: colors.musgo, fontWeight: 500 }}>
          ← Volver a la portada
        </Link>
      </div>
    </div>
  );
}
