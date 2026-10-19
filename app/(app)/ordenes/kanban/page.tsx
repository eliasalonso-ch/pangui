import { redirect } from "next/navigation";

// La vista Kanban se eliminó el 2026-10-19 (sin uso en producción desde
// septiembre). La ruta queda solo para que los marcadores viejos caigan en la lista.
export default function KanbanEliminado() {
  redirect("/ordenes/lista");
}
