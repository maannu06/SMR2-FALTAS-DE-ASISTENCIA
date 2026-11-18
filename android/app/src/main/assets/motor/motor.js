// Motor de la app (versión Android). Es la parte de src/main.js de la app de Windows que guarda los datos,
// decide cuándo leer Educamos, compara las faltas y avisa. Funciona dentro de un WebView oculto.
//
// La parte de Android (Kotlin) le da dos objetos:
//   AndroidHost: guardar y leer datos, registro, notificaciones, cifrado de la contraseña y enviar datos a la pantalla
//   AndroidNav:  el navegador oculto con el que se lee Educamos (lo usa lector.js a través de «Nav»)

/* global AndroidHost, AndroidNav, leerEducamos, mantenerSesion, cerrarSesion, buscarHorasOficiales,
   normalizar, comparar, limite, proximaLectura, interpretarCurso, horarioPorDia, construirModulos, mapaNombres, quitarTildes, RESPALDO_SMR2 */

const G = typeof globalThis !== 'undefined' ? globalThis : window;
const CONFIG = JSON.parse(AndroidHost.config()); // { urlInicio, hostSSO, baseFP, version }

// ---------- Navegador oculto (respuestas asíncronas desde Android) ----------
let sigPeticion = 1;
const pendientes = {};
function pedir(op, arg) {
  return new Promise(res => { const id = sigPeticion++; pendientes[id] = res; AndroidNav.pedir(id, op, arg == null ? '' : String(arg)); });
}
G.__nav = (id, valor) => { const r = pendientes[id]; delete pendientes[id]; if (r) r(valor); };
const Nav = {
  cargar: url => pedir('cargar', url),
  url: () => pedir('url', ''),
  ejecutar: js => pedir('ejecutar', js),
  borrar: () => pedir('borrar', ''),
};
G.Nav = Nav;

// ---------- Datos ----------
const MIN_SESION = 15; // cada cuántos minutos se "toca" Educamos para que no cierre la sesión (sin contraseña guardada)
const AJUSTES_DEF = {
  tema: 'azul',
  intervaloMin: 60,
  leerSiempreAlAbrir: false,
  notificaciones: true,
  centro: 'Brianda de Mendoza',
};
let datos = { sync: null, ajustes: { ...AJUSTES_DEF }, manuales: [], cambios: [], credenciales: null, ultimoIntento: null, config: null };
let estado = { sincronizando: false, paso: '', error: null, sesion: 'desconocida' };

function cargar() {
  try {
    const t = AndroidHost.leerDatos();
    if (!t) return;
    const d = JSON.parse(t);
    datos = { ...datos, ...d, ajustes: { ...AJUSTES_DEF, ...(d.ajustes || {}) } };
    for (const k of Object.keys(datos.ajustes)) if (!(k in AJUSTES_DEF)) delete datos.ajustes[k];
  } catch (e) { registrar('Datos guardados rotos: ' + e.message); }
}
function guardar() { AndroidHost.guardarDatos(JSON.stringify(datos)); }
function registrar(msg) { try { AndroidHost.registrar(String(msg)); } catch (e) {} }

function publico() {
  const { credenciales, ...resto } = datos;
  const prox = cuandoToca();
  const cf = datos.config || {};
  const curso = cf.curso ? { etiqueta: cf.curso.etiqueta, ciclo: cf.curso.ciclo, texto: cf.curso.texto, centro: cf.centro, urlHoras: cf.urlHoras, actualizado: cf.actualizado, aviso: cf.aviso } : null;
  return { ...resto, version: CONFIG.version, android: true,
    proximaLectura: isFinite(prox) ? new Date(Math.max(prox, Date.now())).toISOString() : null,
    credUsuario: credenciales ? credenciales.usuario : null, credFallo: !!(credenciales && credenciales.fallo), cifradoDisponible: true,
    estado, modulos: modulos(), horario: cf.horario || null, curso };
}
function enviar() {
  try { AndroidHost.enviar(JSON.stringify(publico())); } catch (e) {}
  try { AndroidHost.ocupado(!!estado.sincronizando); } catch (e) {}
}

// ---------- Credenciales (cifradas con el almacén de claves de Android) ----------
function credParaUsar() {
  const c = datos.credenciales;
  if (!c || c.fallo) return null;
  const p = AndroidHost.descifrar(c.cifrada || '');
  return p ? { usuario: c.usuario, contrasena: p } : null;
}

// ---------- Avisos ----------
function avisar(titulo, cuerpo) { if (datos.ajustes.notificaciones) AndroidHost.avisar(titulo, cuerpo); }
const modulos = () => ((datos.config && datos.config.modulos) || []).filter(m => m.horas);

function resumenCambios(cambios) {
  const g = {};
  cambios.forEach(c => { g[c.tipo] = g[c.tipo] || {}; g[c.tipo][c.m] = (g[c.tipo][c.m] || 0) + c.n; });
  const txt = (t, pal) => g[t] ? `${Object.values(g[t]).reduce((a, b) => a + b, 0)} ${pal}: ${Object.entries(g[t]).map(([m, n]) => `${m} ${n}`).join(', ')}` : null;
  return [txt('nueva', 'nuevas'), txt('justificada', 'justificadas'), txt('quitada', 'quitadas'), txt('nueva-justificada', 'nuevas ya justificadas'), txt('justificada-quitada', 'justificadas quitadas')].filter(Boolean).join(' · ');
}
function avisosLimite(sync) {
  const cnt = {};
  sync.injust.filter(x => !x.retraso).forEach(x => cnt[x.m] = (cnt[x.m] || 0) + 1);
  return modulos().map(m => ({ m: m.codigo, n: cnt[m.codigo] || 0, lim: limite(m.horas, 25) }))
    .filter(x => x.n >= x.lim * 0.75).map(x => `${x.m} ${x.n}/${x.lim}`);
}
function marcarSesion(nueva, motivo) {
  const antes = estado.sesion;
  estado.sesion = nueva;
  if (nueva === 'login' && antes !== 'login' && datos.sync) {
    avisar('Educamos: vuelve a iniciar sesión', motivo || 'Abre la app y pulsa «Iniciar sesión en Educamos» para que se sigan leyendo tus faltas.');
  }
}
function errorDeSesion(e) {
  if (e.codigo === 'credenciales' && datos.credenciales) { datos.credenciales.fallo = true; guardar(); }
  if (e.codigo === 'login' || e.codigo === 'credenciales') { marcarSesion('login', e.message); return true; }
  return false;
}

// ---------- Lectura ----------
function leer({ curso = false } = {}) {
  return leerEducamos({
    curso, faltas: true, cred: credParaUsar(), centro: datos.ajustes.centro,
    log: p => { registrar(p); if (!/^(Centro en|Cambio de|Fallo en)/.test(p)) { estado.paso = p; enviar(); } },
  });
}

function comprobarAsignaturas(n) {
  const codigos = ((datos.config && datos.config.materias) || []).map(m => m.abrev);
  if (!codigos.length) return;
  const filas = n.injust.concat(n.just).filter(x => !x.completo);
  const raras = filas.filter(x => !codigos.includes(x.m));
  if (filas.length >= 3 && raras.length > filas.length / 2) {
    const nombres = [...new Set(raras.map(x => x.m).filter(Boolean))].slice(0, 3).join(', ');
    throw Object.assign(new Error(`Las faltas leídas son de asignaturas que no salen en tu horario (${nombres}…). Seguramente Educamos estaba en otro centro. No guardo nada; revisa el centro en Ajustes.`), { codigo: 'centro' });
  }
}

// ---------- Curso, horario y horas oficiales (solo la primera vez) ----------
async function horasOficiales(curso) {
  try {
    const r = await buscarHorasOficiales(curso, p => { registrar(p); estado.paso = 'Buscando las horas oficiales de tu curso…'; enviar(); });
    registrar(`Horas oficiales: ${r.filas.length} módulos en ${r.url}`);
    return { url: r.url, titulo: r.titulo, filas: r.filas };
  } catch (e) {
    registrar('No se pudieron leer las horas oficiales: ' + e.message);
    if (/microinform/i.test(quitarTildes(curso.ciclo)) && curso.nivel === 2) {
      return { url: 'https://educacion.castillalamancha.es/fp/que-estudiar/tecnico-en-sistemas-microinformaticos-y-redes', titulo: 'copia guardada en la app', filas: RESPALDO_SMR2, respaldo: true };
    }
    return null;
  }
}

async function montarConfig(r) {
  const curso = interpretarCurso(r.curso.curso);
  const materias = r.horario.materias;
  const horario = horarioPorDia(r.horario.filas, materias);
  const of = await horasOficiales(curso);
  const cfg = { curso, centro: r.curso.centro, materias, horario, actualizado: new Date().toISOString(), modulos: [], urlHoras: of && of.url, aviso: null };
  if (of) {
    const m = construirModulos({ materias, horario, oficiales: of.filas, nivel: curso.nivel });
    cfg.modulos = m.modulos;
    if (m.sinHoras.length) cfg.aviso = 'No he encontrado las horas oficiales de: ' + m.sinHoras.join(', ') + '.';
    if (of.respaldo) cfg.aviso = 'La web oficial no respondía; se han usado las horas guardadas en la app. Lo intentaré otra vez en la próxima lectura.';
    cfg.pendienteHoras = !!of.respaldo;
  } else {
    cfg.modulos = materias.map(x => ({ codigo: x.abrev, nombre: x.nombre, semana: Object.values(horario).reduce((s, d) => s + (d[x.abrev] || 0), 0), horas: null }));
    cfg.aviso = 'No he podido leer las horas oficiales de tu curso. Lo intentaré otra vez en la próxima lectura.';
    cfg.pendienteHoras = true;
  }
  registrar(`Curso: ${curso.texto} · ${cfg.modulos.length} asignaturas · ${cfg.modulos.reduce((s, x) => s + (x.horas || 0), 0)} h${cfg.aviso ? ' · ' + cfg.aviso : ''}`);
  return cfg;
}

async function reintentarHoras() {
  const cfg = datos.config;
  if (!cfg || !cfg.pendienteHoras) return;
  const of = await horasOficiales(cfg.curso);
  if (!of || of.respaldo) return;
  const m = construirModulos({ materias: cfg.materias, horario: cfg.horario, oficiales: of.filas, nivel: cfg.curso.nivel });
  Object.assign(cfg, { modulos: m.modulos, urlHoras: of.url, pendienteHoras: false, actualizado: new Date().toISOString(),
    aviso: m.sinHoras.length ? 'No he encontrado las horas oficiales de: ' + m.sinHoras.join(', ') + '.' : null });
}

async function sincronizar(origen) {
  if (estado.sincronizando) return;
  estado = { ...estado, sincronizando: true, paso: 'Empezando…', error: null };
  registrar(`--- Lectura (${origen}) · versión ${CONFIG.version}`);
  enviar();
  const configAnterior = datos.config;
  try {
    const necesitaCurso = !datos.config || datos.releerCurso;
    const r = await leer({ curso: necesitaCurso });
    let config = datos.config;
    if (necesitaCurso) config = await montarConfig(r);
    else await reintentarHoras();
    const opc = () => ({ nombres: mapaNombres(config.materias), horario: config.horario });
    const nuevo = { actualizado: new Date().toISOString(), injust: normalizar(r.injust, opc()), just: normalizar(r.just, opc()) };
    datos.config = config;
    comprobarAsignaturas(nuevo);
    const prevTotal = datos.sync ? datos.sync.injust.length + datos.sync.just.length : 0;
    const nuevoTotal = nuevo.injust.length + nuevo.just.length;
    if (datos.sync && prevTotal - nuevoTotal >= Math.max(5, prevTotal * 0.2)) {
      estado.paso = 'Han desaparecido muchas faltas: lo compruebo otra vez…'; enviar();
      const r2 = await leer();
      const n2 = { injust: normalizar(r2.injust, opc()), just: normalizar(r2.just, opc()) };
      if (n2.injust.length !== nuevo.injust.length || n2.just.length !== nuevo.just.length) {
        throw Object.assign(new Error('Dos lecturas seguidas de Educamos no coinciden. No guardo nada; lo intento en la próxima lectura.'), { codigo: 'dudosa' });
      }
    }
    const cambios = comparar(datos.sync, nuevo).map(c => ({ ...c, detectado: nuevo.actualizado }));
    const anteriorLimite = datos.sync ? avisosLimite(datos.sync) : [];
    datos.sync = nuevo;
    if (cambios.length) datos.cambios = cambios.concat(datos.cambios || []).slice(0, 300);
    registrar(`Lectura correcta: ${nuevo.injust.length} horas injustificadas, ${nuevo.just.length} justificadas, ${cambios.length} cambios`);
    datos.ultimoIntento = { t: nuevo.actualizado, ok: true };
    delete datos.releerCurso;
    guardar();
    estado = { sincronizando: false, paso: '', error: null, sesion: 'ok' };
    if (cambios.length) avisar('Cambios en tus faltas', resumenCambios(cambios));
    const lim = avisosLimite(nuevo).filter(x => !anteriorLimite.includes(x));
    if (lim.length && cambios.some(c => c.tipo === 'nueva')) avisar('Cuidado con el límite', 'Pasas del 75 % en: ' + lim.join(', '));
  } catch (e) {
    datos.config = configAnterior;
    estado = { ...estado, sincronizando: false, paso: '', error: e.message || String(e) };
    registrar(`ERROR ${e.codigo || ''}: ${e.message || e}`);
    errorDeSesion(e);
    const esperaUsuario = (e.codigo === 'login' || e.codigo === 'credenciales') && !credParaUsar();
    datos.ultimoIntento = { t: new Date().toISOString(), ok: false, esperaUsuario };
    guardar();
  }
  enviar();
}

async function tocarSesion() {
  if (estado.sincronizando || estado.sesion !== 'ok' || credParaUsar()) return;
  estado.sincronizando = true; AndroidHost.ocupado(true);
  try { await mantenerSesion({}); }
  catch (e) { errorDeSesion(e); }
  finally { estado.sincronizando = false; enviar(); }
}

function cuandoToca() {
  return proximaLectura({ ultimaBuena: datos.sync && datos.sync.actualizado, ultimoIntento: datos.ultimoIntento, intervaloMin: datos.ajustes.intervaloMin });
}
function comprobar() {
  if (!estado.sincronizando && Date.now() >= cuandoToca()) sincronizar('auto');
  else enviar();
}

// ---------- Órdenes de la pantalla ----------
const ORDENES = {
  datos: () => publico(),
  ajustes: parcial => {
    for (const k of Object.keys(parcial || {})) if (k in AJUSTES_DEF) datos.ajustes[k] = parcial[k];
    guardar(); enviar(); comprobar();
    return true;
  },
  releerCurso: () => { datos.releerCurso = true; sincronizar('curso y horario'); return true; },
  manuales: lista => {
    datos.manuales = Array.isArray(lista) ? lista.slice(0, 500).map(x => ({ id: String(x.id), f: String(x.f).slice(0, 10), m: String(x.m).slice(0, 20), n: Math.max(1, Math.min(6, Number(x.n) || 1)) })) : [];
    guardar(); enviar(); return true;
  },
  borrarCambios: () => { datos.cambios = []; guardar(); enviar(); return true; },
  sincronizar: () => { sincronizar('manual'); return true; },
  cerrarSesion: async () => { await cerrarSesion(); estado.sesion = 'login'; enviar(); return true; },
  guardarCredenciales: (usuario, contrasena) => {
    usuario = String(usuario || '').trim(); contrasena = String(contrasena || '');
    if (!usuario || !contrasena) return { ok: false, msg: 'Escribe el usuario y la contraseña.' };
    const cifrada = AndroidHost.cifrar(contrasena);
    if (!cifrada) return { ok: false, msg: 'Este móvil no permite cifrar la contraseña; no la guardo.' };
    datos.credenciales = { usuario, cifrada, fallo: false };
    datos.ultimoIntento = null; guardar(); enviar();
    if (estado.sesion !== 'ok') sincronizar('cred');
    return { ok: true };
  },
  borrarCredenciales: () => { datos.credenciales = null; guardar(); enviar(); return true; },
  // Lo llama Android cuando se cierra la pantalla de inicio de sesión
  trasLogin: ok => {
    if (ok) { estado.sesion = 'ok'; estado.error = null; datos.ultimoIntento = null; enviar(); sincronizar('login'); }
    return ok;
  },
};

const Motor = {
  rpc(id, metodo, argsJson) {
    Promise.resolve().then(() => {
      const f = ORDENES[metodo];
      if (!f) throw new Error('Orden desconocida: ' + metodo);
      return f(...JSON.parse(argsJson || '[]'));
    }).then(r => AndroidHost.respuesta(id, JSON.stringify(r === undefined ? null : r)),
      e => { registrar('Error en ' + metodo + ': ' + e.message); AndroidHost.respuesta(id, 'null'); });
  },
  comprobar,
  tocarSesion,
  // Al arrancar: la primera vez (app nueva) se lee curso, horario y faltas; después, solo cuando toque
  arrancar(abriendoPantalla) {
    if (!datos.config || (abriendoPantalla && datos.ajustes.leerSiempreAlAbrir)) sincronizar(datos.config ? 'inicio' : 'primera configuración');
    else comprobar();
  },
  ocupado: () => !!estado.sincronizando,
};
G.Motor = Motor;

cargar();
// Mientras el motor está vivo, se mira cada minuto si toca leer (sin tocar Educamos si no toca)
setInterval(comprobar, 60 * 1000);
setInterval(tocarSesion, MIN_SESION * 60 * 1000);
enviar();
