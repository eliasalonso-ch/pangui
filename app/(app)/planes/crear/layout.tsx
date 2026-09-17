"use client";

import { usePathname } from "next/navigation";
import { PlanDraftProvider } from "./PlanDraftContext";
import PlanCrearForm from "./PlanCrearForm";
import PlantillaForm from "./plantilla/PlantillaForm";

/**
 * Envuelve /planes/crear y /planes/crear/plantilla en el mismo provider.
 *
 * Ambas hojas se montan aquí a la vez y se alternan con CSS en vez de
 * renderizarse por ruta. Antes cada una era el `children` de su page y navegar
 * desmontaba la otra: volver a la plantilla la remontaba, y su `useEffect` de
 * carga repetía las seis consultas (usuarios, categorías, proveedores, partes,
 * materiales y procedimientos ya elegidos) con un spinner de por medio, aunque
 * el usuario solo estuviera yendo y viniendo entre dos pasos del mismo
 * formulario.
 *
 * Montadas las dos, cambiar de paso es instantáneo y el estado local de cada
 * una — lo escrito en la plantilla sin guardar incluido — sobrevive el ida y
 * vuelta sin pasar por el borrador.
 *
 * La URL se conserva: siguen siendo dos rutas reales, y `children` se ignora
 * porque las pages ya no pintan nada (el layout es quien decide qué se ve
 * segun el pathname).
 *
 * `visibility: hidden` en vez de desmontar: `display: none` colapsa el alto y
 * la hoja oculta perdería su posición de scroll al volver.
 */
export default function CrearPlanLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const enPlantilla = pathname?.endsWith("/plantilla") ?? false;

  return (
    <PlanDraftProvider>
      <div style={{ height: "100%", position: "relative" }}>
        <Hoja visible={!enPlantilla}><PlanCrearForm /></Hoja>
        <Hoja visible={enPlantilla}><PlantillaForm /></Hoja>
      </div>
    </PlanDraftProvider>
  );
}

function Hoja({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!visible}
      // inert evita que lo oculto siga siendo tabulable: sin esto el Tab del
      // formulario visible se iba a los campos de la otra hoja. React 19 lo
      // acepta como booleano; con string vacío avisa que lo trata como false.
      {...(!visible ? { inert: true } : {})}
      style={{
        position: "absolute", inset: 0,
        visibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {children}
    </div>
  );
}
