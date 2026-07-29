-- Usuarios que no cuentan para la facturación.
--
-- Hasta ahora el cobro contaba todo usuario con `activo = true`
-- (lib/flow-sync.ts), así que la única forma de sacar a alguien del cobro era
-- desactivarlo — lo que también le quita el acceso. Eso no sirve para las
-- cuentas de soporte de Pangui que viven dentro del workspace de un cliente
-- para dar soporte y desarrollar funciones: necesitan acceso completo sin
-- sumar al total.
--
-- Aditivo: columna nueva con DEFAULT false, así ningún workspace cambia de
-- precio al aplicar la migración.
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS excluir_de_facturacion boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.usuarios.excluir_de_facturacion IS
  'Si es true, el usuario no suma al conteo de usuarios facturables. Reservado '
  'para cuentas de staff de Pangui dentro del workspace de un cliente; no lo '
  'expone la UI de administración del cliente.';

-- Índice parcial: el conteo de facturación filtra por workspace + activo y
-- ahora también excluye estos usuarios. Son unas pocas filas en toda la tabla,
-- así que el índice parcial es chico.
CREATE INDEX IF NOT EXISTS idx_usuarios_excluir_facturacion
  ON public.usuarios (workspace_id)
  WHERE excluir_de_facturacion;
