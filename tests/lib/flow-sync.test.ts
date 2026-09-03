import { beforeEach, describe, expect, it, vi } from "vitest";

// Dobles de Flow y de la base: la lógica que importa es qué llamadas se hacen
// y con qué cantidad, no la red.
// vi.hoisted: vi.mock se eleva sobre las declaraciones del módulo, así que
// las fábricas no pueden cerrar sobre un `const` normal.
const { flowMock, estado } = vi.hoisted(() => ({
  flowMock: {
    getSubscription:             vi.fn(),
    listSubscriptionItemCatalog: vi.fn(),
    createSubscriptionItem:      vi.fn(),
    addSubscriptionItem:         vi.fn(),
    updateSubscriptionItem:      vi.fn(),
    removeSubscriptionItem:      vi.fn(),
  },
  estado: { sub: null as Record<string, unknown> | null, usuarios: 0 },
}));
vi.mock("@/lib/flow", () => ({ flow: flowMock }));
vi.mock("@/app/api/suscripcion/_helpers", () => ({
  adminSupabase: () => ({
    from(tabla: string) {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select: chain, eq: chain, neq: chain, is: chain,
        maybeSingle: async () => ({ data: estado.sub }),
        then: (resolve: (v: unknown) => void) =>
          resolve(tabla === "usuarios" ? { count: estado.usuarios } : { data: estado.sub }),
      });
      return q;
    },
  }),
}));

import { syncSubscriptionToUserCount, itemUsuariosExtra } from "@/lib/flow-sync";

const subCobrada = {
  id: "s1", flow_subscription_id: "sus_x", status: "active",
  plan_key: "pro", price_per_user_clp: 3990,
};
// 3990 neto → 4748 bruto, que es lo que Flow tiene que cobrar por usuario.
const ITEM_4748 = { id: 970, name: "Usuario adicional", amount: 4748, currency: "CLP", status: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  estado.sub = subCobrada;
  estado.usuarios = 10;
  flowMock.getSubscription.mockResolvedValue({ items: [] });
  flowMock.listSubscriptionItemCatalog.mockResolvedValue({ data: [ITEM_4748] });
  flowMock.addSubscriptionItem.mockResolvedValue({ success: true });
  flowMock.updateSubscriptionItem.mockResolvedValue({ success: true });
  flowMock.removeSubscriptionItem.mockResolvedValue({});
});

describe("syncSubscriptionToUserCount", () => {
  // El caso real: 10 usuarios cobrables → 1 en el plan + 9 en el ítem.
  it("asocia el ítem por itemId y fija la cantidad de usuarios extra", async () => {
    await syncSubscriptionToUserCount("ws");

    expect(flowMock.addSubscriptionItem).toHaveBeenCalledWith({ subscriptionId: "sus_x", itemId: 970 });
    expect(flowMock.updateSubscriptionItem).toHaveBeenCalledWith({ subscriptionId: "sus_x", itemId: 970, quantity: 9 });
    expect(flowMock.createSubscriptionItem).not.toHaveBeenCalled();
  });

  it("busca el ítem del catálogo por el monto BRUTO, no por el neto", async () => {
    flowMock.listSubscriptionItemCatalog.mockResolvedValue({
      data: [{ ...ITEM_4748, id: 1, amount: 3990 }, ITEM_4748],
    });
    await syncSubscriptionToUserCount("ws");
    expect(flowMock.addSubscriptionItem).toHaveBeenCalledWith(expect.objectContaining({ itemId: 970 }));
  });

  it("crea el ítem en el catálogo si no existe uno a ese monto", async () => {
    flowMock.listSubscriptionItemCatalog.mockResolvedValue({ data: [] });
    flowMock.createSubscriptionItem.mockResolvedValue({ ...ITEM_4748, id: 555 });

    await syncSubscriptionToUserCount("ws");

    expect(flowMock.createSubscriptionItem).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 4748, currency: "CLP" }),
    );
    expect(flowMock.addSubscriptionItem).toHaveBeenCalledWith({ subscriptionId: "sus_x", itemId: 555 });
  });

  it("con un solo usuario extra no llama a updateItem (addItem ya deja 1)", async () => {
    estado.usuarios = 2;
    await syncSubscriptionToUserCount("ws");
    expect(flowMock.addSubscriptionItem).toHaveBeenCalledOnce();
    expect(flowMock.updateSubscriptionItem).not.toHaveBeenCalled();
  });

  it("si el ítem ya está asociado solo ajusta la cantidad", async () => {
    flowMock.getSubscription.mockResolvedValue({ items: [{ item_id: 970, quantity: 4 }] });
    await syncSubscriptionToUserCount("ws");
    expect(flowMock.addSubscriptionItem).not.toHaveBeenCalled();
    expect(flowMock.updateSubscriptionItem).toHaveBeenCalledWith(expect.objectContaining({ quantity: 9 }));
  });

  it("no toca Flow si la cantidad ya coincide", async () => {
    flowMock.getSubscription.mockResolvedValue({ items: [{ item_id: 970, quantity: 9 }] });
    await syncSubscriptionToUserCount("ws");
    expect(flowMock.addSubscriptionItem).not.toHaveBeenCalled();
    expect(flowMock.updateSubscriptionItem).not.toHaveBeenCalled();
    expect(flowMock.removeSubscriptionItem).not.toHaveBeenCalled();
  });

  it("quita el ítem cuando ya no hay usuarios extra", async () => {
    estado.usuarios = 1;
    flowMock.getSubscription.mockResolvedValue({ items: [{ item_id: 970, quantity: 9 }] });
    await syncSubscriptionToUserCount("ws");
    expect(flowMock.removeSubscriptionItem).toHaveBeenCalledWith({ subscriptionId: "sus_x", itemId: 970 });
    expect(flowMock.addSubscriptionItem).not.toHaveBeenCalled();
  });

  // Cambio de plan o de precio: el ítem viejo tiene otro monto y sobra.
  it("reemplaza un ítem de otro precio por el correcto", async () => {
    flowMock.getSubscription.mockResolvedValue({ items: [{ item_id: 111, quantity: 9 }] });
    await syncSubscriptionToUserCount("ws");
    expect(flowMock.removeSubscriptionItem).toHaveBeenCalledWith({ subscriptionId: "sus_x", itemId: 111 });
    expect(flowMock.addSubscriptionItem).toHaveBeenCalledWith({ subscriptionId: "sus_x", itemId: 970 });
  });

  it("no hace nada sin mandato en Flow (trial, basic_free, cortesía)", async () => {
    estado.sub = { ...subCobrada, flow_subscription_id: null };
    await syncSubscriptionToUserCount("ws");
    expect(flowMock.getSubscription).not.toHaveBeenCalled();
  });

  // El callback adjunta este ítem en planAdditionalList al crear: Flow rechaza
  // el mismo itemId repetido y no acepta cantidad en la creación, así que el
  // monto total de los usuarios extra va en una sola línea.
  it("itemUsuariosExtra pide un ítem por el TOTAL, no por usuario", async () => {
    flowMock.listSubscriptionItemCatalog.mockResolvedValue({ data: [] });
    flowMock.createSubscriptionItem.mockResolvedValue({ id: 843 });

    await expect(itemUsuariosExtra(9, 4748)).resolves.toEqual({ id: 843 });
    expect(flowMock.createSubscriptionItem).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 42_732 }),  // 9 × 4.748
    );
  });

  it("itemUsuariosExtra reutiliza el ítem del catálogo si ya existe", async () => {
    flowMock.listSubscriptionItemCatalog.mockResolvedValue({
      data: [{ id: 843, name: "9 usuarios", amount: 42732, currency: "CLP", status: 1 }],
    });
    await expect(itemUsuariosExtra(9, 4748)).resolves.toEqual({ id: 843 });
    expect(flowMock.createSubscriptionItem).not.toHaveBeenCalled();
  });

  it("un fallo de Flow no se propaga al llamador", async () => {
    flowMock.getSubscription.mockRejectedValue(new Error("Flow caído"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(syncSubscriptionToUserCount("ws")).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
