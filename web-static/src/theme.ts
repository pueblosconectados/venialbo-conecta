import type { CSSProperties } from "react";
import type { ThemeConfig } from "antd";

// Los tres colores de marca salen muestreados del logo de la portada: el verde
// del wordmark VENIALBO, el dorado de CONECTA y la terracota de la casa (que
// es un degradado de #f0a010 a #a00018, asi que se toma su media). Las cremas y
// los marrones son neutros de apoyo y no salen del logo.
export const colors = {
  musgo: "#487824",
  musgoClaro: "#7fa066",
  musgoFondo: "#edf2e9",
  terracota: "#d05211",
  terracotaOscuro: "#b1460e",
  crema: "#faf6ef",
  cremaOscuro: "#f0e9d8",
  marronTexto: "#3d2f1f",
  marronSuave: "#6b5a44",
  dorado: "#de9c00",
  borde: "#e8e0d0",
  blanco: "#ffffff",
};

export const fonts = {
  serif: "'Fraunces', 'Georgia', serif",
  sans: "'Inter', system-ui, -apple-system, sans-serif",
};

export type TagTone = "musgo" | "terracota" | "dorado" | "lila" | "rojo" | "azul" | "gris";

export const tagTones: Record<TagTone, { bg: string; color: string }> = {
  musgo: { bg: "#edf2e9", color: "#416c20" },
  terracota: { bg: "#f9eae2", color: "#b1460e" },
  dorado: { bg: "#fbf3e0", color: "#906500" },
  lila: { bg: "#efe8f7", color: "#6b4d99" },
  rojo: { bg: "#f9e0e0", color: "#b03030" },
  azul: { bg: "#e0eaf2", color: "#3d6691" },
  gris: { bg: "#f0eadd", color: "#6b5a44" },
};

export const softTagStyle = (tone: TagTone): CSSProperties => {
  const t = tagTones[tone];
  return {
    background: t.bg,
    color: t.color,
    border: "none",
    fontWeight: 500,
    fontSize: 12,
    padding: "2px 10px",
    borderRadius: 6,
  };
};

export const softTagStyleFromHex = (hex: string): CSSProperties => {
  const clean = hex.replace("#", "").slice(0, 6);
  return {
    background: `#${clean}1f`,
    color: `#${clean}`,
    border: "none",
    fontWeight: 500,
    fontSize: 12,
    padding: "2px 10px",
    borderRadius: 6,
  };
};

export const venialboTheme: ThemeConfig = {
  token: {
    colorPrimary: colors.musgo,
    colorInfo: colors.musgo,
    colorSuccess: "#52a23a",
    colorWarning: colors.dorado,
    colorError: "#c0392b",
    colorTextBase: colors.marronTexto,
    colorBgBase: colors.crema,
    colorBgContainer: colors.blanco,
    colorBgLayout: colors.crema,
    colorBorder: colors.borde,
    colorBorderSecondary: colors.cremaOscuro,
    borderRadius: 10,
    borderRadiusLG: 14,
    borderRadiusSM: 6,
    fontFamily: fonts.sans,
    fontSize: 15,
    boxShadow: "0 2px 8px rgba(61, 47, 31, 0.06)",
    boxShadowSecondary: "0 4px 16px rgba(61, 47, 31, 0.08)",
  },
  components: {
    Layout: {
      bodyBg: colors.crema,
      headerBg: colors.blanco,
      headerColor: colors.marronTexto,
      headerHeight: 68,
      headerPadding: "0 24px",
      footerBg: colors.musgoFondo,
      footerPadding: "20px 24px",
    },
    Menu: {
      itemBg: "transparent",
      itemColor: colors.marronTexto,
      itemSelectedColor: colors.musgo,
      itemSelectedBg: colors.musgoFondo,
      itemHoverColor: colors.musgo,
      horizontalItemSelectedColor: colors.musgo,
      horizontalItemHoverColor: colors.musgo,
      horizontalItemBorderRadius: 6,
      // Menos aire entre apartados que el de Ant Design, para que los ocho quepan a
      // 1280 px sin que el último se esconda en «…»
      itemPaddingInline: 8,
    },
    Card: {
      borderRadiusLG: 14,
      boxShadowTertiary: "0 1px 4px rgba(61, 47, 31, 0.06)",
    },
    Button: {
      borderRadius: 8,
      controlHeight: 38,
      fontWeight: 500,
    },
    Tag: {
      borderRadiusSM: 6,
    },
    Typography: {
      titleMarginBottom: "0.4em",
      fontWeightStrong: 600,
    },
  },
};
