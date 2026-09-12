// El sufijo lo pone el layout raíz con su template "%s | Pangui". Escribirlo
// acá además lo duplicaba: la pestaña decía "Órdenes de compra | Pangui | Pangui".
export const metadata = {
  title: "Órdenes de compra",
  description: "Órdenes de compra a proveedores: creación, aprobación, envío y recepción.",
};

export default function OrdenesCompraLayout({ children }) {
  return children;
}
