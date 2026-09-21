import { useEffect, useRef } from "react";

// Al abrir una imagen a pantalla completa se mete una entrada en el historial, para
// que el boton atras la cierre en vez de sacar al visitante de la ficha. En un movil
// Android el boton atras del sistema es justo ese, asi que sin esto tocar "atras"
// con la imagen abierta te devuelve al listado.
//
// Tambien funciona al reves: si la imagen se cierra con la X, con Esc o pulsando
// fuera, hay que retirar la entrada que habiamos metido para no dejar basura en el
// historial (y que el siguiente "atras" haga lo que toca).
export const useCierreConAtras = (abierta: boolean, cerrar: () => void) => {
  const entradaPuesta = useRef(false);
  // El listener de popstate se registra una sola vez; con la referencia no hay que
  // volver a suscribirse cada vez que cambia la funcion de cerrar.
  const cerrarRef = useRef(cerrar);
  useEffect(() => {
    cerrarRef.current = cerrar;
  });

  useEffect(() => {
    if (abierta && !entradaPuesta.current) {
      entradaPuesta.current = true;
      // Misma URL: react-router ve la misma ruta y no navega a ningun sitio.
      window.history.pushState({ vcImagenAbierta: true }, "");
      return;
    }
    if (!abierta && entradaPuesta.current) {
      entradaPuesta.current = false;
      window.history.back();
    }
  }, [abierta]);

  useEffect(() => {
    const alPulsarAtras = () => {
      if (!entradaPuesta.current) return;
      // Se marca antes de cerrar para que el efecto de arriba no llame a back()
      // otra vez: la entrada ya la acaba de quitar el propio navegador.
      entradaPuesta.current = false;
      cerrarRef.current();
    };
    window.addEventListener("popstate", alPulsarAtras);
    return () => window.removeEventListener("popstate", alPulsarAtras);
  }, []);

  // Si se desmonta con la imagen abierta (por ejemplo navegando desde dentro),
  // se retira la entrada para no dejarla colgada.
  useEffect(
    () => () => {
      if (entradaPuesta.current) {
        entradaPuesta.current = false;
        window.history.back();
      }
    },
    [],
  );
};
