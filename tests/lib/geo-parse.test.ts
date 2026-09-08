import { describe, it, expect } from 'vitest';
import { parseCoordenadas, formatearCoordenadas } from '@/lib/geo-parse';

// URLs reales resueltas desde los enlaces cortos que entregó el usuario.
const URL_UDEC =
  'https://www.google.com/maps/place/University+of+Concepci%C3%B3n/@-36.8299341,-73.6454431,10z/data=!4m7!3m6!1s0x9669b42abd2afd05:0xe5eb203a9b1aae9b!8m2!3d-36.8299341!4d-73.0357019!16zL20vMDRwMDJ5';
const URL_INGENIERIA =
  'https://www.google.com/maps/place/Faculty+of+Engineering/@-36.8313304,-73.0381745,16.5z/data=!3m1!5s0x9669b42bad762cf5:0xa1ea463d6bbc5477!4m7!3m6!1s0x9669b42a5204a02f:0xf47d8331995520d4!8m2!3d-36.8301756!4d-73.0370559!16s%2Fg%2F120qcs2w';

describe('parseCoordenadas', () => {
  it('prefiere el marcador !3d/!4d por sobre el viewport @', () => {
    // El caso que importa: el segmento @ dice -73.6454431 (~50 km al oeste)
    // mientras el marcador real está en -73.0357019.
    const r = parseCoordenadas(URL_UDEC);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lat).toBeCloseTo(-36.8299341, 6);
    expect(r.lng).toBeCloseTo(-73.0357019, 6);
    expect(r.lng).not.toBeCloseTo(-73.6454431, 3);
  });

  it('extrae el marcador de un edificio dentro del campus', () => {
    const r = parseCoordenadas(URL_INGENIERIA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lat).toBeCloseTo(-36.8301756, 6);
    expect(r.lng).toBeCloseTo(-73.0370559, 6);
  });

  it('rechaza enlaces cortos con un motivo accionable', () => {
    const r = parseCoordenadas('https://maps.app.goo.gl/n5fqmz6ACUhXwUPYA');
    expect(r).toEqual({ ok: false, motivo: 'acortado' });
  });

  it('acepta un par de coordenadas suelto', () => {
    const r = parseCoordenadas('-36.8299341, -73.0357019');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fuente).toBe('coordenadas');
    expect(r.lat).toBeCloseTo(-36.8299341, 6);
  });

  it('acepta coordenadas separadas solo por espacio', () => {
    const r = parseCoordenadas('-36.83 -73.03');
    expect(r.ok).toBe(true);
  });

  it('usa @ cuando no hay marcador', () => {
    const r = parseCoordenadas('https://www.google.com/maps/@-36.8299,-73.0357,17z');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lat).toBeCloseTo(-36.8299, 4);
  });

  it('lee coordenadas del parámetro ?q=', () => {
    const r = parseCoordenadas('https://www.google.com/maps?q=-36.8299,-73.0357');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lng).toBeCloseTo(-73.0357, 4);
  });


  it('una URL truncada a la altura del @ devuelve el viewport, no el marcador', () => {
    // Este es el modo de fallo real: si se parsea el texto MIENTRAS llega,
    // el "@" aparece antes que !3d/!4d y se guarda la camara en vez del lugar.
    // Por eso el campo solo confirma al pegar/blur/Enter, nunca en cada tecla.
    const truncada = 'https://www.google.com/maps/place/Faculty+of+Medicine+UdeC/@-36.8263182,-73.0410338,17z/data=!3m1!4b1!4m6!3m5';
    const r = parseCoordenadas(truncada);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Devuelve el viewport porque el marcador aun no esta en el texto.
    expect(r.lng).toBeCloseTo(-73.0410338, 6);

    // La URL COMPLETA sí da el marcador correcto (Medicina).
    const completa = truncada + '!1s0x9669b42cf3d560cf:0x42eb144885d420aa!8m2!3d-36.8263225!4d-73.0384589!16s%2Fg%2F11jgf0c25';
    const r2 = parseCoordenadas(completa);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.lat).toBeCloseTo(-36.8263225, 6);
    expect(r2.lng).toBeCloseTo(-73.0384589, 6);
    expect(r2.lng).not.toBeCloseTo(-73.0410338, 4);
  });

  it('rechaza texto vacío', () => {
    expect(parseCoordenadas('')).toEqual({ ok: false, motivo: 'vacio' });
    expect(parseCoordenadas('   ')).toEqual({ ok: false, motivo: 'vacio' });
  });

  it('rechaza texto sin coordenadas', () => {
    expect(parseCoordenadas('FACULTAD DE MEDICINA').ok).toBe(false);
  });

  it('rechaza coordenadas fuera de rango', () => {
    expect(parseCoordenadas('-91.5, -73.03')).toEqual({ ok: false, motivo: 'fuera_de_rango' });
    expect(parseCoordenadas('-36.8, 181')).toEqual({ ok: false, motivo: 'fuera_de_rango' });
  });

  it('rechaza 0,0 (null island: casi siempre un parseo fallido)', () => {
    expect(parseCoordenadas('0, 0').ok).toBe(false);
  });

  it('no confunde una URL de Maps sin coordenadas', () => {
    const r = parseCoordenadas('https://www.google.com/maps/place/Universidad+de+Concepcion');
    expect(r).toEqual({ ok: false, motivo: 'sin_coordenadas' });
  });
});

describe('formatearCoordenadas', () => {
  it('usa 6 decimales', () => {
    expect(formatearCoordenadas(-36.8299341, -73.0357019)).toBe('-36.829934, -73.035702');
  });
});
