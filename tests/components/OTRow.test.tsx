import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OTRow from "@/app/(app)/ordenes/OTRow";
import type { OrdenListItem, Usuario } from "@/types/ordenes";

// Asignar desde la tarjeta llama a updateOrden; el resto del módulo es real.
const updateOrden = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ordenes-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ordenes-api")>()),
  updateOrden,
}));

// La foto de perfil sale de una query (TanStack) que en la app provee el
// layout. Aca solo importan las iniciales: se renderizan tal cual.
vi.mock("@/components/FotoPerfil", () => ({
  FotoOIniciales: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const baseOrden: OrdenListItem = {
  id: "ot-1",
  titulo: "Cambio de tubos fluorescentes",
  descripcion: "N° OT: SF001\n\nDescripción de la tarea",
  estado: "pendiente",
  prioridad: "alta",
  tipo: "solicitud",
  tipo_trabajo: "reactiva",
  clasificacion: "ejecucion",
  fecha_inicio: null,
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
  n_serie: "SF001",
  solicitante: null,
  hito: null,
  iniciado_at: null,
  en_ejecucion: false,
  tiempo_total_segundos: null,
  categorias_ot: null,
  ubicaciones: { id: "u1", edificio: "Edificio Central", detalle: null, sociedad_id: null },
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
    expect(screen.getByText("Sin asignar")).toBeInTheDocument();
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
    expect(row).toHaveAttribute("aria-selected", "true");
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

  it("shows overdue badge when fecha_termino is past", async () => {
    const overdue = {
      ...baseOrden,
      fecha_termino: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
    };
    render(<OTRow orden={overdue} usuarios={usuarios} isSelected={false} onClick={vi.fn()} />);
    expect(await screen.findByText(/Vencio/)).toBeInTheDocument();
  });

  // La categoría ya no se muestra en la tarjeta: se quitó junto con la
  // descripción para que todas las filas tengan la misma altura. Sigue estando
  // en el detalle de la OT.
  it("does not show a category chip on the card", () => {
    const ordenWithCat = {
      ...baseOrden,
      categorias_ot: { id: "c1", nombre: "Eléctrica", icono: "⚡", color: "#F59E0B" },
    };
    render(<OTRow orden={ordenWithCat} usuarios={usuarios} isSelected={false} onClick={vi.fn()} />);
    expect(screen.queryByText("Eléctrica")).not.toBeInTheDocument();
  });

  it("copies N° OT to clipboard on copy button click", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, writable: true });

    render(<OTRow orden={baseOrden} usuarios={usuarios} isSelected={false} onClick={vi.fn()} />);
    const copyBtn = screen.getByTitle(/Copiar/);
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

describe("OTRow — imprimir solicitud", () => {
  const impresion = { pdfUrl: "https://cdn.example/s.pdf", impresaAt: null, impresaPor: null };
  const props = { usuarios, isSelected: false, onClick: vi.fn() };

  it("sin PDF de MeConecta no muestra el botón", () => {
    render(<OTRow orden={baseOrden} {...props} onImprimir={vi.fn()} onMarcarImpresa={vi.fn()} />);
    expect(screen.queryByLabelText("Imprimir solicitud")).not.toBeInTheDocument();
  });

  it("imprime sin abrir la OT y solo marca si se confirma", async () => {
    const onClick = vi.fn();
    const onImprimir = vi.fn().mockResolvedValue(undefined);
    const onMarcar = vi.fn().mockResolvedValue(undefined);
    render(<OTRow orden={baseOrden} {...props} onClick={onClick} impresion={impresion} onImprimir={onImprimir} onMarcarImpresa={onMarcar} />);
    await userEvent.click(screen.getByLabelText("Imprimir solicitud"));
    expect(onImprimir).toHaveBeenCalledWith("https://cdn.example/s.pdf");
    expect(onClick).not.toHaveBeenCalled();
    expect(onMarcar).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Sí, marcar" }));
    expect(onMarcar).toHaveBeenCalledWith("ot-1");
  });

  it("si no se imprimió, no marca", async () => {
    const onMarcar = vi.fn().mockResolvedValue(undefined);
    render(<OTRow orden={baseOrden} {...props} impresion={impresion} onImprimir={vi.fn().mockResolvedValue(undefined)} onMarcarImpresa={onMarcar} />);
    await userEvent.click(screen.getByLabelText("Imprimir solicitud"));
    await userEvent.click(await screen.findByRole("button", { name: "No" }));
    expect(onMarcar).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("impresa: reimprimir no vuelve a preguntar", async () => {
    const onImprimir = vi.fn().mockResolvedValue(undefined);
    render(<OTRow orden={baseOrden} {...props}
      impresion={{ ...impresion, impresaAt: "2026-11-06T13:30:00Z", impresaPor: "u2" }} onImprimir={onImprimir} onMarcarImpresa={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("Reimprimir solicitud"));
    expect(onImprimir).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("OTRow — asignar desde la tarjeta", () => {
  it("es optimista: avisa antes de que responda el servidor", async () => {
    updateOrden.mockReturnValue(new Promise(() => {})); // nunca responde
    const onAssigned = vi.fn();
    render(<OTRow orden={baseOrden} usuarios={usuarios} isSelected={false} onClick={vi.fn()} myId="u2" onAssigned={onAssigned} />);
    await userEvent.click(screen.getByTitle("Asignar usuario"));
    await userEvent.click(screen.getByRole("button", { name: /Ana López/ }));
    expect(onAssigned).toHaveBeenCalledWith("ot-1", ["u1"]);
  });

  it("si el servidor falla, vuelve a los asignados de antes", async () => {
    updateOrden.mockRejectedValue(new Error("409"));
    const onAssigned = vi.fn();
    render(<OTRow orden={baseOrden} usuarios={usuarios} isSelected={false} onClick={vi.fn()} myId="u2" onAssigned={onAssigned} />);
    await userEvent.click(screen.getByTitle("Asignar usuario"));
    await userEvent.click(screen.getByRole("button", { name: /Ana López/ }));
    await vi.waitFor(() => expect(onAssigned).toHaveBeenLastCalledWith("ot-1", []));
  });
});
