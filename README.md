# Pangui — Gestión de Órdenes de Trabajo

Sistema de gestión de mantenimiento para equipos técnicos. Permite crear, asignar y hacer seguimiento de órdenes de trabajo, gestionar inventario, exportar reportes y facturar servicios.

---

## Tech Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, CSS Modules, Lucide Icons |
| Backend / Auth / DB | Supabase (PostgreSQL + Auth + Realtime) |
| Data fetching | SWR |
| Exportación | jsPDF + jspdf-autotable, xlsx-js-style |
| Notificaciones | In-app en web + push en app móvil nativa |

---

## Roles de usuario

| Rol | Acceso |
|-----|--------|
| `tecnico` | Ver órdenes asignadas, registrar avance, subir fotos y firma |
| `jefe` | Dashboard completo, crear/gestionar órdenes, inventario y reportes |
| `admin` | Igual que jefe, más gestión de usuarios y plantas |

---

## Funcionalidades principales

- **Órdenes de trabajo** — ciclo de vida completo: pendiente → en curso → en revisión → completado/cancelado
- **Dashboard en tiempo real** — órdenes del día y por período, KPIs, filtros por técnico
- **Exportación** — PDF y Excel de reportes por período
- **Notificaciones** — alertas dentro del sitio web y push en la app móvil nativa
- **Gestión de inventario** — stock, movimientos, alertas de stock mínimo
- **Clientes** — CRUD de clientes y seguimiento de órdenes por cliente
- **Cierre administrativo** — reportes PDF/Excel con evidencia, materiales y costos
- **Mantenimiento preventivo** — plantillas de mantenciones recurrentes
- **Modo oscuro** — tema claro / oscuro / sistema
- **App móvil nativa** — experiencia de terreno para Android/iOS

---

## Estructura de rutas

```
/login                    Autenticación
/jefe                     Dashboard principal (jefe)
/jefe/trabajo/nuevo       Crear orden de trabajo
/jefe/trabajo/[id]        Ver / gestionar orden
/jefe/clientes            Gestión de clientes
/jefe/inventario          Gestión de inventario
/jefe/preventivos         Mantenimientos preventivos
/jefe/calendario          Vista calendario de órdenes
/jefe/usuarios            Gestión de usuarios de la planta
/tecnico                  Dashboard técnico
/tecnico/trabajo/[id]     Ejecutar orden de trabajo
/tecnico/inventario       Consulta de inventario
/configuracion            Perfil, contraseña y notificaciones
/arco                     Portal de derechos ARCO (público)
```

---

## Estructura del proyecto

```
app/              Rutas Next.js (App Router)
components/       Componentes reutilizables (Topbar, BottomNav, FirmaCanvas, etc.)
lib/              Utilidades (supabase client, perfil-cache, exportadores, push)
sql/              Migraciones de base de datos
supabase/         Configuración y edge functions de Supabase
public/           Íconos y assets públicos
```

---

## Variables de entorno

Crear un archivo `.env.local` en la raíz del proyecto:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu-anon-key>
RESEND_API_KEY=<tu-resend-key>         # opcional, para email
```

---

## Desarrollo local

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).
