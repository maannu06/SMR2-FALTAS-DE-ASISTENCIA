// Cálculos y comparación de faltas (sin dependencias de Electron, para poder probarlo).
//
// Las asignaturas, el horario y las horas de cada asignatura ya no van escritos aquí: la app los lee
// de Educamos (curso y horario) y de la web oficial de FP de Castilla-La Mancha (horas). Lo que hay
// abajo como «RESPALDO_SMR2» solo se usa si la web oficial no responde y el curso es 2.º de SMR.

const quitarTildes = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Copia de seguridad: tabla oficial de 2.º SMR (educacion.castillalamancha.es, noviembre de 2026)
const RESPALDO_SMR2 = [
  { nombre: 'Aplicaciones ofimáticas', horas: 270, semana: 7 },
  { nombre: 'Sistemas operativos en red', horas: 223, semana: 6 },
  { nombre: 'Seguridad informática', horas: 167, semana: 4 },
  { nombre: 'Servicios en red', horas: 205, semana: 5 },
  { nombre: 'Itinerario personal para la empleabilidad II', horas: 60, semana: 3 },
  { nombre: 'Optatividad', horas: 80, semana: 4 },
  { nombre: 'Proyecto intermodular de Sistemas microinformáticos y redes', horas: 55, semana: 1 },
];

// «2º de CFGM (LOFP) - Sistemas Microinformáticos y Redes / CSMR2D» → { nivel: 2, tipo: 'CFGM', ciclo: 'Sistemas Microinformáticos y Redes', grupo: 'CSMR2D' }
function interpretarCurso(texto) {
  const t = (texto || '').replace(/\s+/g, ' ').trim();
  const nivel = parseInt((t.match(/^(\d)\s*[ºo°]/) || [])[1], 10) || null;
  const tipo = (t.match(/\b(CFGM|CFGS|CFGB|FPB|CE)\b/i) || [])[1] || null;
  let resto = t.includes(' - ') ? t.slice(t.indexOf(' - ') + 3) : t;
  const grupo = resto.includes(' / ') ? resto.slice(resto.lastIndexOf(' / ') + 3).trim() : null;
  if (grupo) resto = resto.slice(0, resto.lastIndexOf(' / '));
  const ciclo = resto.replace(/\(.*?\)/g, '').trim();
  const nombreTipo = { CFGM: 'Grado Medio', CFGS: 'Grado Superior', CFGB: 'Grado Básico', FPB: 'FP Básica', CE: 'Curso de especialización' }[(tipo || '').toUpperCase()] || '';
  const siglas = ciclo.split(/\s+/).filter(p => p.length > 2 && !/^(de|del|la|las|los|en|para|con|por)$/i.test(p)).map(p => p[0].toUpperCase()).join('');
  return { texto: t, nivel, tipo: tipo && tipo.toUpperCase(), ciclo, grupo, etiqueta: `${nivel ? nivel + '.º ' : ''}${siglas || ciclo}`, nombreTipo };
}

// Horario leído de Educamos → { 1: { APOF: 1, SRED: 2, … }, … } (1 = lunes) contando solo asignaturas de «Materias».
// En una misma hora puede salir la misma asignatura dos veces (dos profesores): cuenta una vez.
function horarioPorDia(filas, materias) {
  const validas = new Set(materias.map(m => m.abrev));
  const h = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} };
  filas.forEach(f => f.dias.forEach((asigs, i) => {
    new Set(asigs.filter(a => validas.has(a))).forEach(a => { h[i + 1][a] = (h[i + 1][a] || 0) + 1; });
  }));
  return h;
}

// Junta las asignaturas del horario con las horas de la tabla oficial.
// filasOficiales: [{ nombre: '0223. Aplicaciones ofimáticas', horas: 270, semana: [7, 0] }] (semana por curso)
function construirModulos({ materias, horario, oficiales, nivel }) {
  const semanaDe = cod => Object.values(horario).reduce((s, d) => s + (d[cod] || 0), 0);
  const limpia = n => quitarTildes(n).replace(/^\d+\.\s*/, '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  const usadas = new Set();
  const modulos = [], sinHoras = [];
  for (const m of materias) {
    const n = limpia(m.nombre);
    let of = oficiales.find(o => !usadas.has(o) && limpia(o.nombre) === n)
      || oficiales.find(o => !usadas.has(o) && (limpia(o.nombre).startsWith(n) || n.startsWith(limpia(o.nombre))) && limpia(o.nombre).length > 6);
    if (of) usadas.add(of);
    modulos.push({ codigo: m.abrev, nombre: m.nombre, semana: semanaDe(m.abrev), horas: of ? of.horas : null, oficial: of ? of.nombre : null });
  }
  // Las que no salen con su nombre en la tabla oficial suelen ser la optativa («Optatividad»)
  const opt = oficiales.find(o => /^optativ/.test(limpia(o.nombre)) && !usadas.has(o));
  const sin = modulos.filter(x => x.horas == null);
  if (opt && sin.length === 1) { sin[0].horas = opt.horas; sin[0].oficial = opt.nombre; sin[0].nombre += ' (optativa)'; }
  // Si aún falta alguna, se calcula con sus horas semanales y las semanas del curso (aviso)
  modulos.filter(x => x.horas == null).forEach(x => { sinHoras.push(x.nombre); });
  return { modulos: modulos.filter(x => x.semana > 0 || x.horas != null), sinHoras, nivel };
}

// filas de Educamos: [fecha dd/mm/aaaa, módulo o «Día completo», retraso, motivo, notificada]
// Un «Día completo» se reparte en las horas que tocan ese día según el horario.
// nombres: { 'aplicaciones ofimaticas': 'APOF', … } sacado de la tabla «Materias» del horario.
function normalizar(filas, { nombres = {}, horario = {} } = {}) {
  const codigoDe = nombre => {
    const n = quitarTildes(nombre);
    if (nombres[n]) return nombres[n];
    const k = Object.keys(nombres).find(x => n.startsWith(x) || x.startsWith(n));
    return k ? nombres[k] : nombre; // desconocido: se guarda el nombre tal cual
  };
  const out = [];
  filas.forEach(c => {
    const [d, m, a] = (c[0] || '').split('/');
    const f = `${a}-${m}-${d}`, retraso = /^s/i.test((c[2] || '').trim());
    if (/^dia completo$/.test(quitarTildes(c[1]))) {
      const h = horario[new Date(+a, +m - 1, +d).getDay()];
      if (h && Object.keys(h).length) Object.entries(h).forEach(([cod, n]) => { for (let i = 0; i < n; i++) out.push({ f, m: cod, retraso, completo: true }); });
      else for (let i = 0; i < 6; i++) out.push({ f, m: 'Día completo', retraso, completo: true });
    } else out.push({ f, m: codigoDe(c[1]), retraso });
  });
  return out;
}
const mapaNombres = materias => Object.fromEntries((materias || []).map(m => [quitarTildes(m.nombre).replace(/\s*\(optativa\)$/, ''), m.abrev || m.codigo]));

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

function limite(horas, pct) { return Math.floor((horas || 0) * pct / 100); }

// Cuándo toca la próxima lectura automática de faltas (en milisegundos desde 1970).
const REINTENTO_MIN = 30;
function proximaLectura({ ultimaBuena, ultimoIntento, intervaloMin }) {
  const iv = Math.max(15, Number(intervaloMin) || 60) * 60000;
  const base = ultimaBuena ? Date.parse(ultimaBuena) : 0;
  let prox = base ? base + iv : 0;
  if (ultimoIntento && !ultimoIntento.ok && Date.parse(ultimoIntento.t) >= base) {
    if (ultimoIntento.esperaUsuario) return Infinity;
    prox = Date.parse(ultimoIntento.t) + Math.min(iv, REINTENTO_MIN * 60000);
  }
  return prox;
}

module.exports = { quitarTildes, interpretarCurso, horarioPorDia, construirModulos, normalizar, mapaNombres, comparar, limite, proximaLectura, RESPALDO_SMR2 };
