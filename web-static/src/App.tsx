import { useLayoutEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigationType } from "react-router";
import { ConfigProvider } from "antd";
import esES from "antd/locale/es_ES";
import "antd/dist/reset.css";
import { venialboTheme } from "./theme";

import { BASE_URL } from "./config";

import { PublicLayout } from "./public/layout/PublicLayout";
import { Home } from "./public/pages/Home";
import { NoticiasList } from "./public/pages/noticias/NoticiasList";
import { NoticiasShow } from "./public/pages/noticias/NoticiasShow";
import { ActividadesList } from "./public/pages/actividades/ActividadesList";
import { ActividadesShow } from "./public/pages/actividades/ActividadesShow";
import { Descubre } from "./public/pages/descubre/Descubre";
import { LugaresShow } from "./public/pages/descubre/LugaresShow";
import { RutasShow } from "./public/pages/descubre/RutasShow";
import { NegociosList } from "./public/pages/negocios/NegociosList";
import { NegociosShow } from "./public/pages/negocios/NegociosShow";
import { Privacidad } from "./public/pages/Privacidad";
import { ServiciosList } from "./public/pages/servicios/ServiciosList";
import { ServiciosShow } from "./public/pages/servicios/ServiciosShow";
import { AnunciosList } from "./public/pages/anuncios/AnunciosList";
import { AnunciosShow } from "./public/pages/anuncios/AnunciosShow";
import { PueblosConectados } from "./public/pages/PueblosConectados";
import { EnlacesInteres } from "./public/pages/Enlaces";
import { Buscar } from "./public/pages/Buscar";
import { VistaPrevia } from "./public/pages/VistaPrevia";
import { NotFound } from "./pages/NotFound";

// Al tocar un enlace la página no se recarga, solo cambia lo de dentro, y el navegador
// deja el scroll donde estaba: quien bajaba en la portada hasta una actividad o hasta el
// menú de abajo entraba en la ficha o en el Tablón ya bajado. En el ordenador no se veía:
// el «cargando» deja la página corta un instante y el navegador sube solo; en el móvil,
// con los datos ya en memoria, a veces ni se pinta y el scroll se queda. Al ir a otra página se
// sube arriba; al volver atrás (POP) no, para que el navegador lo deje donde estaba. Los
// enlaces a un #apartado los lleva la propia página (Privacidad).
function ArribaAlCambiarDePagina() {
  const { pathname, hash } = useLocation();
  const tipo = useNavigationType();
  useLayoutEffect(() => {
    if (tipo !== "POP" && !hash) window.scrollTo(0, 0);
    // Solo al cambiar de página: cambiar de pestaña en el Tablón (?tab=) no sube
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  return null;
}

function App() {
  return (
    <BrowserRouter basename={BASE_URL}>
      <ArribaAlCambiarDePagina />
      <ConfigProvider locale={esES} theme={venialboTheme}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/noticias" element={<NoticiasList />} />
            <Route path="/noticias/:id" element={<NoticiasShow />} />
            <Route path="/actividades" element={<ActividadesList />} />
            <Route path="/actividades/:id" element={<ActividadesShow />} />
            <Route path="/descubre" element={<Descubre />} />
            <Route path="/descubre/lugares/:id" element={<LugaresShow />} />
            <Route path="/descubre/rutas/:id" element={<RutasShow />} />
            <Route path="/negocios" element={<NegociosList />} />
            <Route path="/negocios/:id" element={<NegociosShow />} />
            <Route path="/servicios" element={<ServiciosList />} />
            <Route path="/servicios/:id" element={<ServiciosShow />} />
            <Route path="/tablon" element={<AnunciosList />} />
            <Route path="/tablon/:id" element={<AnunciosShow />} />
            <Route path="/pueblos-conectados" element={<PueblosConectados />} />
            <Route path="/enlaces" element={<EnlacesInteres />} />
            <Route path="/privacidad" element={<Privacidad />} />
            <Route path="/buscar" element={<Buscar />} />
            <Route path="/borrador/:clave" element={<VistaPrevia />} />
          </Route>
          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
