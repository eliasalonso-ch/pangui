"use client"

/**
 * Selectores de fecha, hora y fecha+hora en reemplazo de los
 * <input type="date|time|datetime-local"> nativos del navegador.
 *
 * Patrón de los ejemplos de shadcn/ui ("Date Picker" y "DateTimePicker 24h"):
 * calendario de react-day-picker v9 en un popover de Radix, horas y minutos en
 * columnas. Pero con los estilos del resto de la app (inline + variables CSS),
 * no con las clases Tailwind de shadcn: este proyecto tiene `preflight: false`
 * y sus variables `--background`/`--border` no son las de shadcn, así que
 * esos componentes salían con los botones nativos del navegador.
 *
 * El calendario usa la hoja de estilos propia de react-day-picker, tematizada
 * en globals.css (`.pangui-rdp`). Reloj de 24 h y calendario en español.
 * Minutos de a 1: un paso de procedimiento registra la hora real ("10:37").
 */

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { DayPicker, type DropdownProps } from "react-day-picker"
import "react-day-picker/style.css"
import { CalendarClock, CalendarIcon, ChevronDown, Clock } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"

const HORAS = Array.from({ length: 24 }, (_, i) => i)
const MINUTOS = Array.from({ length: 60 }, (_, i) => i)
const dos = (n: number) => n.toString().padStart(2, "0")
// Rango de años del desplegable.
const DESDE = new Date(2000, 0)
const HASTA = new Date(new Date().getFullYear() + 10, 11)

/** Botón que abre el selector: mismo aspecto que los demás inputs. */
const Disparador = React.forwardRef<HTMLButtonElement, {
  icon: React.ReactNode
  texto: string | null
  placeholder: string
  abierto: boolean
  disabled?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>>(function Disparador(
  { icon, texto, placeholder, abierto, disabled, ...props }, ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      {...props}
      style={{
        width: "100%", height: 40, padding: "0 12px", boxSizing: "border-box",
        display: "flex", alignItems: "center", gap: 8,
        border: `1px solid ${abierto ? "var(--brand)" : "var(--border)"}`, borderRadius: "var(--r-sm)",
        background: "var(--surface-1)", cursor: disabled ? "default" : "pointer", textAlign: "left",
        fontSize: 14, fontFamily: "inherit", color: texto ? "var(--fg-1)" : "var(--fg-4)",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {texto ?? placeholder}
      </span>
      <span style={{ display: "flex", flexShrink: 0, color: "var(--fg-3)" }}>{icon}</span>
    </button>
  )
})

/** Panel flotante con la forma de los desplegables de la app. */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align="start"
        sideOffset={4}
        collisionPadding={12}
        style={{
          // Sobre los modales de la app (el de ejecución de procedimientos es 70).
          zIndex: 1000,
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", outline: "none",
        }}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}

/**
 * Desplegable de mes / año del calendario. Reemplaza el <select> nativo que
 * trae react-day-picker: su lista abierta es la del sistema operativo (no se
 * puede estilar) y al enfocarlo dibujaba un contorno negro sobre el texto.
 * Mismo aspecto que los desplegables de la app. react-day-picker espera un
 * evento de cambio de <select>; se le pasa uno mínimo con `target.value`.
 */
function DropdownCalendario({ options = [], value, onChange, "aria-label": ariaLabel, disabled }: DropdownProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const listaRef = React.useRef<HTMLDivElement>(null)
  const actual = options.find(o => o.value === Number(value))

  React.useEffect(() => {
    if (!open) return
    listaRef.current?.querySelector<HTMLElement>("[aria-selected=true]")?.scrollIntoView({ block: "center" })
    const fuera = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false) } }
    document.addEventListener("mousedown", fuera)
    document.addEventListener("keydown", esc, true)
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc, true) }
  }, [open])

  const elegir = (v: number) => {
    onChange?.({ target: { value: String(v) } } as React.ChangeEvent<HTMLSelectElement>)
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 8px 0 10px",
          border: `1px solid ${open ? "var(--brand)" : "var(--border)"}`, borderRadius: 6,
          background: "var(--surface-1)", cursor: "pointer", outline: "none",
          fontFamily: "inherit", fontSize: 14, fontWeight: 500, color: "var(--fg-1)", textTransform: "capitalize",
        }}
        onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)" }}
        onBlur={e => { if (!open) e.currentTarget.style.borderColor = "var(--border)" }}
      >
        {actual?.label}
        <ChevronDown size={14} style={{ color: "var(--fg-3)" }} />
      </button>
      {open && (
        <div
          ref={listaRef}
          role="listbox"
          className="scroll-visible"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 10, minWidth: "100%",
            maxHeight: 240, overflowY: "auto", padding: "4px 0",
            background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
            boxShadow: "var(--shadow-md)",
          }}
        >
          {options.map(o => {
            const sel = o.value === Number(value)
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={sel}
                disabled={o.disabled}
                onClick={() => elegir(o.value)}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "var(--surface-hover)" }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent" }}
                style={{
                  display: "block", width: "100%", textAlign: "left", whiteSpace: "nowrap",
                  padding: "7px 14px", border: "none", cursor: o.disabled ? "default" : "pointer",
                  fontFamily: "inherit", fontSize: 14, textTransform: "capitalize",
                  background: sel ? "var(--brand-tint)" : "transparent",
                  color: o.disabled ? "var(--fg-4)" : sel ? "var(--brand)" : "var(--fg-1)",
                }}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Calendario({ value, onSelect }: { value: Date | undefined; onSelect: (d: Date | undefined) => void }) {
  return (
    <DayPicker
      className="pangui-rdp"
      mode="single"
      locale={es}
      selected={value}
      defaultMonth={value}
      onSelect={onSelect}
      showOutsideDays
      autoFocus
      // Mes y año con desplegables (ejemplo "Calendar · caption dropdown" de
      // shadcn): saltar a otro año sin pasar mes por mes.
      captionLayout="dropdown"
      startMonth={DESDE}
      endMonth={HASTA}
      components={{ Dropdown: DropdownCalendario }}
    />
  )
}

/** Columna de horas o minutos; al abrir se centra en el valor elegido. */
function Columna({ valores, actual, onPick, etiqueta }: {
  valores: number[]
  actual: number | null
  onPick: (n: number) => void
  etiqueta: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[aria-selected=true]")?.scrollIntoView({ block: "center" })
  }, [])
  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={etiqueta}
      className="scroll-visible"
      style={{ height: 296, width: 64, overflowY: "auto", padding: 6, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 2 }}
    >
      {valores.map(v => {
        const sel = actual === v
        return (
          <button
            key={v}
            type="button"
            role="option"
            aria-selected={sel}
            onClick={() => onPick(v)}
            onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "var(--surface-hover)" }}
            onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent" }}
            style={{
              flexShrink: 0, height: 34, border: "none", borderRadius: 6, cursor: "pointer",
              fontFamily: "inherit", fontSize: 14, fontVariantNumeric: "tabular-nums",
              background: sel ? "var(--brand)" : "transparent",
              color: sel ? "var(--fg-on-brand)" : "var(--fg-1)",
            }}
          >
            {dos(v)}
          </button>
        )
      })}
    </div>
  )
}

const divisor: React.CSSProperties = { width: 1, alignSelf: "stretch", background: "var(--border)" }

/** Fecha sola. */
export function DatePicker({ value, onChange, placeholder = "Seleccionar fecha", disabled }: {
  value: Date | undefined
  onChange: (d: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <Disparador icon={<CalendarIcon size={16} />} texto={value ? format(value, "dd/MM/yyyy") : null} placeholder={placeholder} abierto={open} disabled={disabled} />
      </PopoverPrimitive.Trigger>
      <Panel>
        <Calendario value={value} onSelect={d => { onChange(d); setOpen(false) }} />
      </Panel>
    </PopoverPrimitive.Root>
  )
}

/** Hora sola, en formato "HH:mm" (o "" sin valor). */
export function TimePicker({ value, onChange, placeholder = "Seleccionar hora", disabled }: {
  value: string
  onChange: (hhmm: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [h, m] = value ? value.split(":").map(Number) : [null, null]
  const set = (hora: number, min: number) => onChange(`${dos(hora)}:${dos(min)}`)
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <Disparador icon={<Clock size={16} />} texto={value || null} placeholder={placeholder} abierto={open} disabled={disabled} />
      </PopoverPrimitive.Trigger>
      <Panel>
        <div style={{ display: "flex" }}>
          <Columna etiqueta="Hora" valores={HORAS} actual={h} onPick={v => set(v, m ?? 0)} />
          <span style={divisor} />
          <Columna etiqueta="Minutos" valores={MINUTOS} actual={m} onPick={v => set(h ?? 0, v)} />
        </div>
      </Panel>
    </PopoverPrimitive.Root>
  )
}

/** Fecha y hora juntas (24 h). Elegir la hora sin fecha parte de hoy. */
export function DateTimePicker({ value, onChange, placeholder = "Seleccionar fecha y hora", disabled }: {
  value: Date | undefined
  onChange: (d: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const base = () => (value ? new Date(value) : new Date(new Date().setSeconds(0, 0)))
  const elegirDia = (d: Date | undefined) => {
    if (!d) return
    const next = new Date(d)
    const ref = base()
    next.setHours(ref.getHours(), ref.getMinutes(), 0, 0)
    onChange(next)
  }
  const elegirHora = (tipo: "h" | "m", v: number) => {
    const next = base()
    if (tipo === "h") next.setHours(v); else next.setMinutes(v)
    onChange(next)
  }
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <Disparador icon={<CalendarClock size={16} />} texto={value ? format(value, "dd/MM/yyyy HH:mm") : null} placeholder={placeholder} abierto={open} disabled={disabled} />
      </PopoverPrimitive.Trigger>
      <Panel>
        <div style={{ display: "flex" }}>
          <Calendario value={value} onSelect={elegirDia} />
          <span style={divisor} />
          <Columna etiqueta="Hora" valores={HORAS} actual={value ? value.getHours() : null} onPick={v => elegirHora("h", v)} />
          <span style={divisor} />
          <Columna etiqueta="Minutos" valores={MINUTOS} actual={value ? value.getMinutes() : null} onPick={v => elegirHora("m", v)} />
        </div>
      </Panel>
    </PopoverPrimitive.Root>
  )
}
