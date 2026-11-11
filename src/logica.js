// Cálculos y comparación de faltas (sin dependencias de Electron, para poder probarlo).

const MODULOS = [
  { codigo: 'SRED',  nombre: 'Sistemas operativos en red',                   semana: 6, horas: 223 },
  { codigo: 'APOF',  nombre: 'Aplicaciones ofimáticas',                      semana: 7, horas: 270 },
  { codigo: 'SR',    nombre: 'Servicios en red',                             semana: 5, horas: 205 },
  { codigo: 'SEIN',  nombre: 'Seguridad informática',                        semana: 4, horas: 167 },
  { codigo: 'IALP',  nombre: 'Introducción a la programación (optativa)',    semana: 4, horas: 80  },
  { codigo: 'IPEII', nombre: 'Itinerario personal para la empleabilidad II', semana: 3, horas: 60  },
  { codigo: 'PIMSM', nombre: 'Proyecto intermodular de SMR',                 semana: 1, horas: 55  },
];

// Horas de cada asignatura por día de la semana (horario de Educamos, curso 26/27). 1 = lunes.
const HORARIO = {
  1: { APOF: 1, IPEII: 1, SRED: 2, SR: 2 },
  2: { IALP: 2, SEIN: 2, APOF: 2 },
  3: { SR: 1, IALP: 2, IPEII: 1, SRED: 2 },
  4: { PIMSM: 1, SEIN: 2, APOF: 2, IPEII: 1 },
  5: { SR: 2, SRED: 2, APOF: 2 },
};

const quitarTildes = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const NOMBRES = {
  'introduccion a la programacion': 'IALP',
  'sistemas operativos en red': 'SRED',
  'servicios en red': 'SR',
  'itinerario personal para la empleabilidad ii': 'IPEII',
  'seguridad informatica': 'SEIN',
  'aplicaciones ofimaticas': 'APOF',
  'proyecto intermodular de sistemas microinformaticos y redes': 'PIMSM',
};
function codigoDe(nombre) {
  const n = quitarTildes(nombre);
  if (NOMBRES[n]) return NOMBRES[n];
  const k = Object.keys(NOMBRES).find(x => n.startsWith(x) || x.startsWith(n));
  return k ? NOMBRES[k] : nombre; // desconocido: se guarda el nombre tal cual
}

// filas de Educamos: [fecha dd/mm/aaaa, módulo o «Día completo», retraso, motivo, notificada]
// Un «Día completo» se reparte en las horas que tocan ese día según el horario.
function normalizar(filas) {
  const out = [];
  filas.forEach(c => {
    const [d, m, a] = (c[0] || '').split('/');
    const f = `${a}-${m}-${d}`, retraso = /^s/i.test((c[2] || '').trim());
    if (/^dia completo$/.test(quitarTildes(c[1]))) {
      const dia = new Date(+a, +m - 1, +d).getDay();
      const h = HORARIO[dia];
      if (h) Object.entries(h).forEach(([cod, n]) => { for (let i = 0; i < n; i++) out.push({ f, m: cod, retraso, completo: true }); });
      else for (let i = 0; i < 6; i++) out.push({ f, m: 'Día completo', retraso, completo: true });
    } else out.push({ f, m: codigoDe(c[1]), retraso });
  });
  return out;
}

const clave = x => x.f + '|' + x.m;
function contar(lista) { const c = new Map(); lista.forEach(x => c.set(clave(x), (c.get(clave(x)) || 0) + 1)); return c; }

// Compara la lectura anterior con la nueva y dice qué ha pasado con cada falta
function comparar(prev, nuevo) {
  if (!prev) return [];
  const cambios = [];
  const pI = contar(prev.injust || []), nI = contar(nuevo.injust), pJ = contar(prev.just || []), nJ = contar(nuevo.just);
  const claves = new Set([...pI.keys(), ...nI.keys(), ...pJ.keys(), ...nJ.keys()]);
  for (const k of claves) {
    const [f, m] = k.split('|');
    const dI = (nI.get(k) || 0) - (pI.get(k) || 0);
    let dJ = (nJ.get(k) || 0) - (pJ.get(k) || 0);
    if (dI < 0) {
      const perdidas = -dI;
      const aJust = Math.max(0, Math.min(perdidas, dJ));
      if (aJust) { cambios.push({ tipo: 'justificada', f, m, n: aJust }); dJ -= aJust; }
      if (perdidas - aJust) cambios.push({ tipo: 'quitada', f, m, n: perdidas - aJust });
    } else if (dI > 0) {
      cambios.push({ tipo: 'nueva', f, m, n: dI });
    }
    if (dJ > 0) cambios.push({ tipo: 'nueva-justificada', f, m, n: dJ });
    else if (dJ < 0) cambios.push({ tipo: 'justificada-quitada', f, m, n: -dJ });
  }
  return cambios.sort((a, b) => b.f.localeCompare(a.f));
}

function limite(horas, pct) { return Math.floor(horas * pct / 100); }

module.exports = { MODULOS, HORARIO, codigoDe, normalizar, comparar, limite };
