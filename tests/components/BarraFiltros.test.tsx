import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BarraFiltros } from "@/components/filtros/primitivas";

const chip = (i: number) => <button key={i} type="button">chip {i}</button>;

describe("BarraFiltros", () => {
  it("pone a lo más 12 chips por línea, también los que vienen en fragmentos o con false", () => {
    render(
      <BarraFiltros hayFiltros={false} onLimpiar={() => {}}>
        {chip(0)}
        {false}
        <>{[1, 2, 3, 4, 5].map(chip)}</>
        {[6, 7, 8, 9, 10, 11, 12, 13].map(chip)}
      </BarraFiltros>,
    );
    const primera = screen.getByText("chip 0").parentElement!;
    const segunda = screen.getByText("chip 12").parentElement!;
    expect(primera).not.toBe(segunda);
    expect(primera.children).toHaveLength(12);
    expect(segunda.children).toHaveLength(2);
  });

  it("no repite claves entre un chip suelto y los de un fragmento", () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <BarraFiltros hayFiltros={false} onLimpiar={() => {}}>
        <button type="button">suelto</button>
        <>
          <button type="button">a</button>
          <button type="button">b</button>
        </>
      </BarraFiltros>,
    );
    expect(errores.mock.calls.flat().join(" ")).not.toMatch(/same key/);
    errores.mockRestore();
  });

  it("Limpiar filtros ocupa su lugar siempre, pero solo se ve y responde con filtros puestos", () => {
    const onLimpiar = vi.fn();
    const { rerender } = render(<BarraFiltros hayFiltros={false} onLimpiar={onLimpiar}>{chip(0)}</BarraFiltros>);
    const boton = screen.getByText("Limpiar filtros");
    expect(boton.style.visibility).toBe("hidden");
    fireEvent.click(boton);
    expect(onLimpiar).not.toHaveBeenCalled();

    rerender(<BarraFiltros hayFiltros onLimpiar={onLimpiar}>{chip(0)}</BarraFiltros>);
    expect(boton.style.visibility).toBe("visible");
    fireEvent.click(boton);
    expect(onLimpiar).toHaveBeenCalledOnce();
  });
});
