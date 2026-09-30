import {
  BrickWall, Building2, Car, Factory, FlaskConical, Fuel, Hotel, House, Landmark,
  LayoutGrid, Package, Pickaxe, Store, Tractor, Truck, UtensilsCrossed,
} from "lucide-react";

// Workspace industries (workspaces.sector). Same list as the /industrias page.
// Slugs that existed before (industria, construccion, agro, facilities, mineria)
// are kept so older workspaces still match; retired ones like "puertos" are
// shown as a legacy option by the Configuración select.
export const SECTORES = [
  { value: "industria", label: "Fabricación general", icon: Factory },
  { value: "construccion", label: "Materiales de construcción", icon: BrickWall },
  { value: "alimentos", label: "Alimentos y bebidas", icon: UtensilsCrossed },
  { value: "quimicos", label: "Químicos", icon: FlaskConical },
  { value: "plasticos", label: "Plásticos", icon: Package },
  { value: "automotriz", label: "Automóviles", icon: Car },
  { value: "retail", label: "Venta minorista", icon: Store },
  { value: "gobierno", label: "Gobierno", icon: Landmark },
  { value: "facilities", label: "Gestión de instalaciones", icon: Building2 },
  { value: "agro", label: "Agricultura y granjas", icon: Tractor },
  { value: "oil_gas", label: "Petróleo y gas upstream", icon: Fuel },
  { value: "mineria", label: "Minería", icon: Pickaxe },
  { value: "propiedades", label: "Gestión de propiedades", icon: House },
  { value: "flotas", label: "Gestión de flotas", icon: Truck },
  { value: "hospitalidad", label: "Hospitalidad", icon: Hotel },
  { value: "otro", label: "Otras industrias", icon: LayoutGrid },
] as const;
