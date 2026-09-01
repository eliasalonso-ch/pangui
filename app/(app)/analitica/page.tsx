import { redirect } from "next/navigation";

// /analitica is a section with two reports (órdenes and activos) rather than a
// page of its own. Órdenes is the default because it is the original report and
// every existing link into /analitica expects it.
export default function AnaliticaIndex() {
  redirect("/analitica/ordenes");
}
