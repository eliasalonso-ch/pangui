// El sufijo lo pone el layout raíz con su template "%s | Pangui". Escribirlo
// acá además lo duplicaba: la pestaña decía "Proveedores | Pangui | Pangui".
export const metadata = {
  title: "Proveedores",
  description: "Proveedores del espacio de trabajo: datos de contacto, tributarios y condiciones de pago.",
};

export default function ProveedoresLayout({ children }) {
  return children;
}
