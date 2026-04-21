import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OTRow from "@/app/(app)/ordenes/OTRow";
import type { OrdenListItem, Usuario } from "@/types/ordenes";

const baseOrden: OrdenListItem = {
  id: "ot-1",
  titulo: "Cambio de tubos fluorescentes",
  descripcion: "N° OT: SF001\n\nDescripción de la tarea",
  estado: "pendiente",
  prioridad: "alta",
  tipo: "solicitud",
  tipo_trabajo: "reactiva",
  fecha_termino: null,
  recurrencia: "ninguna",
  created_at: new Date(Date.now() - 3600000).toISOString(), // 1h ago
  categoria_id: null,
  ubicacion_id: null,
  activo_id: null,
  creado_por: null,
  asignados_ids: [],
  numero: 1,
  parent_id: null,
  categorias_ot: null,
  ubicaciones: { id: "u1", edificio: "Edificio Central", piso: null, sociedad_id: null },
  activos: null,
};

const usuarios: Usuario[] = [
  { id: "u1", nombre: "Ana López", rol: "tecnico" },
  { id: "u2", nombre: "Carlos Pérez", rol: "admin" },
];

describe("OTRow", () => {
  it("renders the order title", () => {
    render(<OTRow orden={baseOrden} usuarios={usuarios} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("Cambio de tubos fluorescentes")).toBeInTheDocument();
  });

  it("renders the N° OT from description meta", () => {
    render(<OTRow orden={baseOrden} usuarios={usuarios} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("SF001")).toBeInTheDocument();
  });

  it("renders status pill", () => {
    render(<OTRow orden={baseOrden} usuarios={usuarios} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("Abierta")).toBeInTheDocument();
  });

  it("renders priority pill", () => {
    render(<OTRow orden={baseOrden} usuarios={usuarios} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("Alta")).toBeInTheDocument();
  });

  it("renders location", () => {
    render(<OTRow orden={baseOrden} usuarios={usuarios} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("Edificio Central")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<OTRow orden={baseOrden} usuarios={usuarios} isSelected={false} onClick={onClick} />);
    await user.click(screen.getByRole("option"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shows selected border when isSelected=true", () => {
    render(<OTRow orden={baseOrden} usuarios={usuarios} isSelected={true} onClick={vi.fn()} />);
    const row = screen.getByRole("option");
    expect(row).toHaveStyle({ borderLeft: "3px solid #2563EB" });
  });

  it("does not call onClick when pending", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const pendingOrden = { ...baseOrden, _pending: true };
    render(<OTRow orden={pendingOrden} usuarios={usuarios} isSelected={false} onClick={onClick} />);
    await user.click(screen.getByRole("option"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders assigned user avatars", () => {
    const ordenWithUsers = { ...baseOrden, asignados_ids: ["u1", "u2"] };
    render(<OTRow orden={ordenWithUsers} usuarios={usuarios} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByTitle("Ana López")).toBeInTheDocument();
    expect(screen.getByTitle("Carlos Pérez")).toBeInTheDocument();
  });

  it("shows overdue badge when fecha_termino is past", () => {
    const overdue = {
      ...baseOrden,
      fecha_termino: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
    };
    render(<OTRow orden={overdue} usuarios={usuarios} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText(/Venció/)).toBeInTheDocument();
  });

  it("shows category chip when categorias_ot is present", () => {
    const ordenWithCat = {
      ...baseOrden,
      categorias_ot: { id: "c1", nombre: "Eléctrica", icono: "⚡", color: "#F59E0B" },
    };
    render(<OTRow orden={ordenWithCat} usuarios={usuarios} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("Eléctrica")).toBeInTheDocument();
  });

  it("copies N° OT to clipboard on copy button click", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, writable: true });

    render(<OTRow orden={baseOrden} usuarios={usuarios} isSelected={false} onClick={vi.fn()} />);
    const copyBtn = screen.getByTitle("Copiar N° OT");
    await user.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith("SF001");
  });

  it("hides priority pill for ninguna priority", () => {
    const noPrioOrden = { ...baseOrden, prioridad: "ninguna" as const };
    render(<OTRow orden={noPrioOrden} usuarios={usuarios} isSelected={false} onClick={vi.fn()} />);
    expect(screen.queryByText("Ninguna")).not.toBeInTheDocument();
  });

  it("shows +N when more than 3 users assigned", () => {
    const moreUsers: Usuario[] = [
      ...usuarios,
      { id: "u3", nombre: "Pedro Soto", rol: "tecnico" },
      { id: "u4", nombre: "Laura Gómez", rol: "tecnico" },
    ];
    const ordenWith4 = { ...baseOrden, asignados_ids: ["u1", "u2", "u3", "u4"] };
    render(<OTRow orden={ordenWith4} usuarios={moreUsers} isSelected={false} onClick={vi.fn()} />);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});
