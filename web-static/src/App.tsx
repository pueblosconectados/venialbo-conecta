import { BrowserRouter, Route, Routes } from "react-router";
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
import { NegociosList } from "./public/pages/negocios/NegociosList";
import { NegociosShow } from "./public/pages/negocios/NegociosShow";
import { Privacidad } from "./public/pages/Privacidad";
import { ServiciosList } from "./public/pages/servicios/ServiciosList";
import { ServiciosShow } from "./public/pages/servicios/ServiciosShow";
import { AnunciosList } from "./public/pages/anuncios/AnunciosList";
import { AnunciosShow } from "./public/pages/anuncios/AnunciosShow";
import { PueblosConectados } from "./public/pages/PueblosConectados";
import { NotFound } from "./pages/NotFound";

function App() {
  return (
    <BrowserRouter basename={BASE_URL}>
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
            <Route path="/negocios" element={<NegociosList />} />
            <Route path="/negocios/:id" element={<NegociosShow />} />
            <Route path="/servicios" element={<ServiciosList />} />
            <Route path="/servicios/:id" element={<ServiciosShow />} />
            <Route path="/tablon" element={<AnunciosList />} />
            <Route path="/tablon/:id" element={<AnunciosShow />} />
            <Route path="/pueblos-conectados" element={<PueblosConectados />} />
            <Route path="/privacidad" element={<Privacidad />} />
          </Route>
          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
