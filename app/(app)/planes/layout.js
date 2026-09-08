// Titula la pestaña de esta sección. La plantilla "%s | Pangui" del layout raíz
// la renderiza como "Planes de mantención | Pangui". Va en un layout porque la
// página es client component y no puede exportar `metadata`.
export const metadata = { title: { default: "Planes de mantención", template: "%s | Pangui" } };

export default function PlanesLayout({ children }) {
  return children;
}
