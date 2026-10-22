-- Revierte el paso 2 del backfill de 20261021230000_foto_items_autoria.
--
-- Ese paso asignaba subido_por desde la actividad 'fotos_grupo_subidas', pero
-- la ruta de subida legacy de la app registraba esa actividad a nombre del
-- CREADOR DE LA CARPETA (insertActividadFotosGrupo usaba foto_grupos.created_by),
-- no de quien subió la foto: 1.601 de 1.601 actividades anteriores al 27-07
-- coinciden con el creador. Esas 1.618 fotos quedaban atribuidas a quien creó
-- la carpeta, que es justo la ambigüedad que subido_por viene a eliminar.
-- Mejor sin autor que con uno falso.
--
-- Se conserva el paso 1 (intents de ot_upload_intents: actor verificado) y lo
-- subido desde el 2026-10-22 (lo pone el trigger con auth.uid()).

BEGIN;

-- El trigger de autoría impide reescribir subido_por en un UPDATE.
ALTER TABLE public.foto_grupo_items DISABLE TRIGGER trg_foto_grupo_items_autoria;

UPDATE public.foto_grupo_items f
SET subido_por = NULL
WHERE f.subido_por IS NOT NULL
  AND f.created_at < '2026-10-22 00:00:00+00'
  AND NOT EXISTS (
    SELECT 1 FROM public.ot_upload_intents i
    WHERE i.kind = 'photo_group_item'
      AND i.status = 'finalized'
      AND i.target ->> 'item_id' = f.id::text
  );

ALTER TABLE public.foto_grupo_items ENABLE TRIGGER trg_foto_grupo_items_autoria;

COMMIT;
