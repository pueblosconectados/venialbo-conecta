import { useEffect, useState } from "react";
import { Outlet, Link, useLocation } from "react-router";
import { Layout, Menu, Button, Drawer, Grid, Typography } from "antd";
import { MenuOutlined, EnvironmentFilled } from "@ant-design/icons";
import { FORMULARIOS } from "../../config";
import { colors, fonts } from "../../theme";
import { BannerAvisos } from "../components/BannerAvisos";

const { Header, Content, Footer } = Layout;
const { useBreakpoint } = Grid;

const NAV_ITEMS = [
  { key: "/noticias", label: "Noticias" },
  { key: "/actividades", label: "Actividades" },
  { key: "/descubre", label: "Descubre Venialbo" },
  { key: "/negocios", label: "Negocios" },
  { key: "/servicios", label: "Servicios e instituciones" },
  { key: "/tablon", label: "Tablón" },
  { key: "/pueblos-conectados", label: "Pueblos Conectados" },
];

export function PublicLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const screens = useBreakpoint();
  const location = useLocation();

  // Al cambiar de página, la pestaña vuelve a su título. Las fichas ponen el suyo en
  // cuanto cargan (CabeceraFicha), que es siempre después de esto.
  useEffect(() => {
    document.title = "VenialboConecta";
  }, [location.pathname]);

  // Las secciones llegan a veces con barra final ("/noticias/"): GitHub Pages redirige
  // ahí porque cada sección es una carpeta con su index.html (paginas-compartir.mjs).
  // Sin quitarla, el menú no marcaría la sección.
  const seccionActual = location.pathname.replace(/(.)\/$/, "$1");

  const menuItems = NAV_ITEMS.map((item) => ({
    key: item.key,
    label: (
      <Link to={item.key} onClick={() => setDrawerOpen(false)}>
        {item.label}
      </Link>
    ),
  }));

  const logoStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: colors.musgo,
    fontFamily: fonts.serif,
    fontWeight: 700,
    fontSize: 22,
    letterSpacing: "-0.02em",
    flexShrink: 0,
  };

  return (
    <Layout style={{ minHeight: "100vh", background: colors.crema }}>
      <Header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          gap: 24,
          background: colors.blanco,
          borderBottom: `1px solid ${colors.borde}`,
          boxShadow: "0 1px 4px rgba(61, 47, 31, 0.04)",
        }}
      >
        <Link to="/" style={logoStyle}>
          <EnvironmentFilled style={{ color: colors.terracota, fontSize: 24 }} />
          <span>Venialbo<span style={{ color: colors.terracota }}>Conecta</span></span>
        </Link>

        {screens.md ? (
          <Menu
            mode="horizontal"
            selectedKeys={[seccionActual]}
            items={menuItems}
            style={{
              flex: 1,
              borderBottom: "none",
              minWidth: 0,
              background: "transparent",
              justifyContent: "flex-end",
              fontWeight: 500,
            }}
          />
        ) : (
          <div style={{ marginLeft: "auto" }}>
            <Button
              type="text"
              icon={<MenuOutlined style={{ color: colors.musgo, fontSize: 20 }} />}
              onClick={() => setDrawerOpen(true)}
            />
          </div>
        )}
      </Header>

      <Drawer
        title={
          <span style={{ fontFamily: fonts.serif, color: colors.musgo }}>
            VenialboConecta
          </span>
        }
        placement="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={260}
      >
        <Menu
          mode="vertical"
          selectedKeys={[seccionActual]}
          items={menuItems}
          style={{ border: "none" }}
        />
      </Drawer>

      <BannerAvisos />

      <Content
        style={{
          maxWidth: 1200,
          width: "100%",
          margin: "0 auto",
          padding: "32px 16px 48px",
        }}
      >
        <Outlet />
      </Content>

      <Footer
        style={{
          textAlign: "center",
          background: colors.musgoFondo,
          color: colors.marronSuave,
          borderTop: `1px solid ${colors.borde}`,
        }}
      >
        <div style={{ marginBottom: 6 }}>
          {/* Contacto sale fuera, al formulario de Tally; privacidad es página propia.
              Van aquí y no en el menú de arriba, que ya va justo de sitio. */}
          <a
            href={FORMULARIOS.contacto}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: colors.musgo, fontWeight: 500, fontSize: 13 }}
          >
            Contacto
          </a>
          <span style={{ color: colors.borde, margin: "0 10px" }}>·</span>
          <Link
            to="/privacidad"
            style={{ color: colors.musgo, fontWeight: 500, fontSize: 13 }}
          >
            Privacidad
          </Link>
        </div>
        <Typography.Text style={{ color: colors.marronSuave, fontSize: 13 }}>
          Hecho con cariño para Venialbo · {new Date().getFullYear()}
        </Typography.Text>
      </Footer>
    </Layout>
  );
}
