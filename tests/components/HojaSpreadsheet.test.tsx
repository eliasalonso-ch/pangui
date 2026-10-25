import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { Hoja, HojaFila } from "@/lib/hojas-api";

const updateFila = vi.fn(async (_id: string, _celdas: Record<string, string>) => {});

const hoja: Hoja = {
  id: "h1", workspace_id: "w1", nombre: "Hoja", tipo: "general", created_by: null, created_at: "", updated_at: "",
  columnas: [
    { id: "a", label: "Ítem", tipo: "texto" },
    { id: "b", label: "Cantidad", tipo: "numero" },
    { id: "c", label: "Precio", tipo: "numero" },
    { id: "d", label: "Total", tipo: "numero" },
  ],
};
const fila = (id: string, orden: number, celdas: Record<string, string>): HojaFila =>
  ({ id, hoja_id: "h1", workspace_id: "w1", orden, celdas, created_at: "", updated_at: "" });

vi.mock("@/lib/hojas-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hojas-api")>()),
  fetchHojas: vi.fn(async () => [hoja]),
  fetchFilas: vi.fn(async () => [
    fila("f1", 0, { a: "Cable", b: "10", c: "1500" }),
    fila("f2", 1, { a: "Caja", b: "20", c: "3000" }),
    fila("f3", 2, { a: "Cinta", b: "30", c: "800" }),
  ]),
  updateFila: (id: string, celdas: Record<string, string>) => updateFila(id, celdas),
}));
vi.mock("@/lib/catalogo-api", () => ({ buscarMateriales: vi.fn(async () => []), tieneCobros: () => false }));
vi.mock("@/lib/cobro-export", () => ({ construirCobro: vi.fn(), descargarCobro: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import HojaSpreadsheet from "@/components/HojaSpreadsheet";

const celdaInput = () => document.activeElement as HTMLInputElement;
const escribir = (v: string) => fireEvent.change(celdaInput(), { target: { value: v } });

async function montar() {
  render(<HojaSpreadsheet workspaceId="w1" userId="u1" ordenId="o1" canEdit canExport />);
  await screen.findByText("Cable");
}
// Las celdas vacías muestran "—"; en orden de lectura: D2, D3, D4.
const vacia = (i: number) => screen.getAllByText("—")[i];

describe("HojaSpreadsheet: escribir fórmulas", () => {
  beforeEach(() => updateFila.mockClear());

  it("autocompleta, inserta referencias con clic y Shift+clic, y guarda con Enter", async () => {
    await montar();
    fireEvent.mouseDown(vacia(0));
    expect(celdaInput().tagName).toBe("INPUT");
    expect(screen.getByText("D2")).toBeInTheDocument(); // la barra nombra la celda

    escribir("=SU");
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("SUMASuma números");
    fireEvent.keyDown(celdaInput(), { key: "Tab" });
    expect(celdaInput().value).toBe("=SUMA(");
    expect(screen.getByText("número1")).toBeInTheDocument(); // la firma, con el argumento actual

    fireEvent.mouseDown(screen.getByText("10"));
    expect(celdaInput().value).toBe("=SUMA(B2");
    fireEvent.mouseDown(screen.getByText("30"), { shiftKey: true });
    expect(celdaInput().value).toBe("=SUMA(B2:B4");

    escribir("=SUMA(B2:B4)");
    expect(screen.getByText("= 60")).toBeInTheDocument(); // resultado en vivo en la barra

    fireEvent.keyDown(celdaInput(), { key: "Enter" });
    await waitFor(() => expect(updateFila).toHaveBeenCalledWith("f1", { a: "Cable", b: "10", c: "1500", d: "=SUMA(B2:B4)" }));
    expect(screen.getByText("60")).toBeInTheDocument();
    // Enter bajó a D3, abierta y vacía.
    expect(celdaInput().value).toBe("");
    expect(screen.getByText("D3")).toBeInTheDocument();
  });

  it("Esc deshace lo escrito sin guardar", async () => {
    await montar();
    fireEvent.mouseDown(vacia(1));
    escribir("hola");
    fireEvent.keyDown(celdaInput(), { key: "Escape" });
    await act(async () => {});
    expect(updateFila).not.toHaveBeenCalled();
    expect(screen.queryByText("hola")).not.toBeInTheDocument();
  });

  it("F4 alterna los $ y un clic sin lugar para referencia cierra la celda y abre la otra", async () => {
    await montar();
    fireEvent.mouseDown(vacia(1));
    escribir("=B2");
    fireEvent.keyDown(celdaInput(), { key: "F4" });
    expect(celdaInput().value).toBe("=$B$2");
    // Tras "=$B$2" un clic no inserta: guarda y abre la celda tocada.
    fireEvent.mouseDown(screen.getByText("Caja"));
    await waitFor(() => expect(updateFila).toHaveBeenCalledWith("f2", expect.objectContaining({ d: "=$B$2" })));
    expect(celdaInput().value).toBe("Caja");
  });

  it("muestra letras de columna y números de fila que calzan con las referencias", async () => {
    await montar();
    for (const t of ["A", "B", "C", "D", "1", "2", "3", "4"]) expect(screen.getByText(t)).toBeInTheDocument();
  });
});
