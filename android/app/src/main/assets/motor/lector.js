// Lector de faltas de EducamosCLM (versión Android).
// Es el mismo lector que el de la app de Windows (src/educamos.js y src/web.js), pero en vez de ventanas de
// Electron usa «Nav»: un navegador oculto (WebView) que maneja la parte de Android.
//   Nav.cargar(url)      abre una página y espera a que cargue
//   Nav.url()            dirección de la página abierta
//   Nav.ejecutar(js)     ejecuta js en la página y en todos sus marcos (frames); devuelve el primer resultado "verdadero"
//   Nav.borrar()         borra la sesión de Educamos (cookies y datos guardados)
// Cuando Educamos abre «Seguimiento Educativo» en otra ventana, Android lo abre en el mismo navegador.

/* global CONFIG, Nav, quitarTildes */

const esperaMs = ms => new Promise(r => setTimeout(r, ms));

class ErrorEducamos extends Error {
  constructor(codigo, mensaje) { super(mensaje); this.codigo = codigo; }
}

const hostDe = url => { try { return new URL(url).host; } catch (e) { return ''; } };
const HOST_EDUCAMOS = () => hostDe(CONFIG.urlInicio);
const esSSO = url => hostDe(url) === CONFIG.hostSSO;
const esClave = url => ['clave.gob.es'].some(x => hostDe(url) === x || hostDe(url).endsWith('.' + x));

async function enFrames(codigo) {
  const r = await Nav.ejecutar(codigo);
  return r ? { valor: r } : null;
}

async function hasta(fn, { timeout = 30000, cada = 700, error = 'Educamos tarda demasiado en responder.' } = {}) {
  const fin = Date.now() + timeout;
  while (Date.now() < fin) {
    const r = await fn();
    if (r) return r;
    await esperaMs(cada);
  }
  throw new ErrorEducamos('tiempo', error);
}

// ¿Está dentro de Educamos (sesión iniciada)?
const JS_DENTRO = `(() => !![...document.querySelectorAll('button,[role=button],a')].find(e => /panel de aplicaciones|cuenta de educamos/i.test((e.getAttribute('aria-label')||'') + ' ' + (e.title||''))))()`;
// ¿Está en la pantalla de entrada, ya cargada?
const JS_FORM_LOGIN = `(() => document.readyState === 'complete' && !!document.querySelector('#kc-form-login, #username'))()`;

async function estadoSesion() {
  return hasta(async () => {
    const url = await Nav.url();
    if (esClave(url)) return 'login';
    if (esSSO(url)) { if (await Nav.ejecutar(JS_FORM_LOGIN)) return 'login'; }
    else if (hostDe(url) === HOST_EDUCAMOS()) { if (await Nav.ejecutar(JS_DENTRO)) return 'ok'; }
    return null;
  }, { timeout: 45000, error: 'Educamos no responde (¿sin internet o la web está caída?).' });
}

async function entrarConCredenciales(cred) {
  const ok = await Nav.ejecutar(`(() => {
    const sw = document.getElementById('showHidePassForm');
    if (sw && !sw.checked) sw.click();
    const u = document.getElementById('username'), p = document.getElementById('password'), b = document.getElementById('kc-login');
    if (!u || !p || !b) return false;
    const poner = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    poner(u, ${JSON.stringify(cred.usuario)}); poner(p, ${JSON.stringify(cred.contrasena)});
    b.click(); return true;
  })()`);
  if (!ok) throw new ErrorEducamos('login', 'No encuentro el formulario de entrada de Educamos.');
  await esperaMs(2500);
  const r = await hasta(async () => {
    const url = await Nav.url();
    if (hostDe(url) === HOST_EDUCAMOS()) { if (await Nav.ejecutar(JS_DENTRO)) return 'ok'; }
    else if (esSSO(url)) {
      if (await Nav.ejecutar(`(() => document.readyState === 'complete' && !!document.querySelector('#kc-form-login') && !!document.querySelector('#input-error, .kc-feedback-text, .alert-error, [class*=error]'))()`)) return 'mal';
    }
    return null;
  }, { timeout: 40000, error: 'Educamos no termina de iniciar sesión.' });
  if (r === 'mal') throw new ErrorEducamos('credenciales', 'Educamos dice que el usuario o la contraseña guardados no son correctos. Vuelve a guardarlos en Ajustes.');
}

async function abrirDentro(cred, log) {
  await Nav.cargar(CONFIG.urlInicio);
  const est = await estadoSesion();
  if (est === 'login') {
    if (!cred) throw new ErrorEducamos('login', 'La sesión de Educamos ha caducado. Pulsa «Iniciar sesión en Educamos».');
    if (esClave(await Nav.url())) throw new ErrorEducamos('login', 'Educamos pide Cl@ve; así no puedo entrar sola. Pulsa «Iniciar sesión en Educamos».');
    log('Iniciando sesión en Educamos…');
    await entrarConCredenciales(cred);
  }
}

async function mantenerSesion({ cred = null } = {}) {
  try { await abrirDentro(cred, () => {}); return 'ok'; }
  finally { await Nav.cargar('about:blank'); }
}

async function cerrarSesion() { await Nav.borrar(); }

// ---------- Tabla de faltas ----------
const JS_LEER_TABLA = `(() => {
  const s = document.querySelector('select[name=X_CONVCENTRO]');
  if (!s) return null;
  const est = document.querySelector('select[name=ESTADO]');
  const txt = document.body ? document.body.innerText : '';
  const m = txt.match(/(\\d+)\\s*-\\s*(\\d+)\\s+de\\s+(\\d+)/);
  const reg = txt.match(/N[úu]mero total de registros:\\s*(\\d+)/i);
  const filas = [...document.querySelectorAll('tr')].filter(r => r.children.length >= 2 && /^\\d{2}\\/\\d{2}\\/\\d{4}$/.test((r.children[0].innerText||'').trim()))
    .map(r => [...r.children].map(c => (c.innerText||'').replace(/\\s+/g,' ').trim()));
  const cabecera = [...document.querySelectorAll('tr')].some(r => /fecha/i.test(r.innerText||'') && /ausencia/i.test(r.innerText||''));
  const vacio = /no (hay|existen|se (han )?encontrad[oa]s?|tiene)\\b[^.\\n]{0,40}(registros?|datos|faltas|resultados)|sin (registros|datos|faltas|resultados)|ning[uú]n (registro|resultado|dato)|registros:\\s*0\\b/i.test(txt);
  return JSON.stringify({ conv: s.value, estado: est ? est.value : null, desde: m ? +m[1] : null, hasta: m ? +m[2] : null, total: m ? +m[3] : null, registros: reg ? +reg[1] : null,
    cabecera, vacio, filas, listo: document.readyState, marca: window.__marcaFaltas || null });
})()`;

async function leerTabla() {
  const r = await enFrames(JS_LEER_TABLA);
  return r ? { datos: JSON.parse(r.valor) } : null;
}
const tablaLista = d => d.listo === 'complete' && (d.cabecera || d.total != null || d.registros != null || d.vacio);
const firmaDe = d => JSON.stringify([d.total, d.desde, d.registros, d.vacio, d.filas]);

async function tablaEstable() {
  let previa = '';
  return hasta(async () => {
    const t = await leerTabla();
    if (!t || !tablaLista(t.datos)) return null;
    const f = firmaDe(t.datos);
    if (f === previa) return t;
    previa = f; return null;
  }, { timeout: 30000, cada: 1200, error: 'La página de faltas no termina de cargar.' });
}

async function ponerFiltro(estado) {
  const marca = 'm' + Date.now() + Math.random().toString(36).slice(2);
  const antes = await tablaEstable();
  const r = await enFrames(`(() => {
    const s = document.querySelector('select[name=X_CONVCENTRO]'), e = document.querySelector('select[name=ESTADO]');
    if (!s || !e) return false;
    window.__marcaFaltas = ${JSON.stringify(marca)};
    let cambio = false;
    if (s.value !== '-2') { s.value = '-2'; s.dispatchEvent(new Event('change', { bubbles: true })); cambio = true; }
    if (e.value !== '${estado}') { e.value = '${estado}'; e.dispatchEvent(new Event('change', { bubbles: true })); cambio = true; }
    return cambio ? 'cambiado' : 'igual';
  })()`);
  if (!r) throw new ErrorEducamos('estructura', 'No encuentro los filtros de la página de faltas (¿ha cambiado Educamos?).');
  const firmaAntes = antes ? firmaDe(antes.datos) : '';
  const inicio = Date.now();
  let previa = '';
  return hasta(async () => {
    const t = await leerTabla();
    if (!t || t.datos.conv !== '-2' || t.datos.estado !== estado || !tablaLista(t.datos)) return null;
    if (r.valor === 'cambiado' && t.datos.marca === marca && firmaDe(t.datos) === firmaAntes && Date.now() - inicio < 20000) return null;
    const firma = firmaDe(t.datos);
    if (firma === previa) return t;
    previa = firma; return null;
  }, { timeout: 45000, cada: 1500, error: 'La página de faltas no termina de cargar.' });
}

async function irAPagina(n, tam) {
  const r = await enFrames(`(() => { if (typeof irAPagina === 'function' && document.querySelector('select[name=X_CONVCENTRO]')) { irAPagina(${n}); return true; } return false; })()`);
  if (!r) throw new ErrorEducamos('estructura', 'No puedo cambiar de página en la lista de faltas.');
  const desdeEsperado = (n - 1) * tam + 1;
  return hasta(async () => {
    const t = await leerTabla();
    return t && t.datos.desde === desdeEsperado && t.datos.listo === 'complete' && t.datos.filas.length ? t : null;
  }, { timeout: 30000, cada: 800, error: 'No carga la página ' + n + ' de la lista de faltas.' });
}

async function leerTodas(estado, log = () => {}) {
  const nombre = estado === 'I' ? 'injustificadas' : 'justificadas';
  let t = await ponerFiltro(estado);
  const d = t.datos;
  if (d.total == null) {
    if (d.registros != null && d.registros !== d.filas.length) {
      throw new ErrorEducamos('recuento', `Educamos dice ${d.registros} faltas ${nombre} pero he leído ${d.filas.length}. No guardo nada para no meter datos mal.`);
    }
    if (d.registros == null && d.filas.length > 0) throw new ErrorEducamos('estructura', `No encuentro el total de faltas ${nombre} en la página.`);
    if (d.filas.length === 0) log(`No hay faltas ${nombre}` + (d.vacio ? ' (Educamos lo dice)' : ''));
    return d.filas;
  }
  if (d.total === 0) return [];
  const tam = Math.max(1, (d.hasta - d.desde + 1) || d.filas.length || 25);
  if (d.desde !== 1) t = await irAPagina(1, tam);
  let filas = t.datos.filas.slice();
  const paginas = Math.ceil(d.total / tam);
  for (let p = 2; p <= paginas; p++) filas = filas.concat((await irAPagina(p, tam)).datos.filas);
  if (filas.length !== d.total) {
    throw new ErrorEducamos('recuento', `Educamos dice ${d.total} faltas ${nombre} pero he leído ${filas.length}. No guardo nada para no meter datos mal.`);
  }
  return filas;
}

// ---------- Centro ----------
const normTxt = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const JS_CENTRO = `(() => { const t = (document.body && document.body.innerText) || ''; const m = t.match(/Alumnad[oa]\\s*\\n\\s*([^\\n]{3,90})/); return m ? m[1].trim() : null; })()`;
const JS_CAMBIAR_CENTRO = c => `(() => {
  const n = s => (s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
  const c = ${JSON.stringify(c)};
  for (const s of document.querySelectorAll('select')) {
    const o = [...s.options].find(o => n(o.text).includes(c));
    if (o && s.value !== o.value) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return 'select'; }
  }
  const cands = [...document.querySelectorAll('a,li,button,[onclick],[role=option],[role=menuitem]')]
    .filter(e => n(e.innerText).includes(c) && (e.innerText||'').length < 120 && !/alumnad[oa]/i.test(e.innerText||''));
  if (cands.length) { cands[cands.length - 1].click(); return 'clic'; }
  const chev = [...document.querySelectorAll('button,a,[onclick],img,[role=button]')]
    .find(e => !(e.innerText||'').trim() && /alumno\\/a/i.test(((e.closest('div,td,table')||{}).innerText)||''));
  if (chev) { chev.click(); return 'desplegar'; }
  return false;
})()`;

async function centroActual() {
  const r = await hasta(() => enFrames(JS_CENTRO), { timeout: 20000, error: 'No encuentro el centro en Seguimiento Educativo.' });
  return r.valor;
}

async function asegurarCentro(centro, log) {
  const c = normTxt(centro);
  if (!c) return;
  let actual = await centroActual();
  log('Centro en Educamos: ' + actual);
  for (let intento = 0; intento < 4 && !normTxt(actual).includes(c); intento++) {
    log('No es «' + centro + '»: cambiando de centro…');
    const r = await enFrames(JS_CAMBIAR_CENTRO(c));
    log('Cambio de centro: ' + (r ? r.valor : 'sin opción'));
    if (!r) break;
    await esperaMs(r.valor === 'desplegar' ? 1500 : 5000);
    actual = await centroActual().catch(() => actual);
    log('Centro en Educamos: ' + actual);
  }
  if (!normTxt(actual).includes(c)) {
    throw new ErrorEducamos('centro', `Educamos está abierto en «${actual}» y no he podido cambiarlo a «${centro}». En Ajustes pulsa «Abrir Educamos para cambiar el centro», elige tu centro y vuelve a leer.`);
  }
}

// ---------- Menú, curso y horario ----------
async function clicMenu(texto, error) {
  const JS = `(() => {
    const norm = s => (s||'').replace(/\\s+/g,' ').trim().toUpperCase();
    const cands = [...document.querySelectorAll('a,li,span,div,td,button')].filter(e => norm(e.innerText || e.textContent) === ${JSON.stringify(texto)});
    if (!cands.length) return false;
    const el = cands.find(e => e.tagName === 'A') || cands[cands.length - 1];
    el.click(); return true;
  })()`;
  const clic = await hasta(() => enFrames(JS), { timeout: 20000 }).catch(() => null);
  if (!clic) {
    await enFrames(`(() => { const e = [...document.querySelectorAll('a,li,span,div')].find(x => (x.innerText||'').replace(/\\s+/g,' ').trim().toUpperCase() === 'SEGUIMIENTO DEL CURSO'); if (e) { e.click(); return true; } return false; })()`);
    await esperaMs(1500);
    await hasta(() => enFrames(JS), { timeout: 15000, error });
  }
}

const JS_CURSO = `(() => {
  const fichas = [];
  for (const t of document.querySelectorAll('table')) {
    const fila = et => [...t.querySelectorAll('tr')].find(r => { const s = r.querySelector('span'); return s && (s.textContent||'').trim().toUpperCase() === et && r.closest('table') === t; });
    const fc = fila('CURSO'), fe = fila('CENTRO');
    if (fc) fichas.push({ curso: fc.textContent.replace(/\\s+/g,' ').trim().replace(/^CURSO\\s*/i,''), centro: fe ? fe.textContent.replace(/\\s+/g,' ').trim().replace(/^CENTRO\\s*/i,'') : null, principal: t.id === 'tablaInicio' });
  }
  return fichas.length ? JSON.stringify(fichas) : null;
})()`;
async function leerCurso(centro) {
  const r = await hasta(() => enFrames(JS_CURSO), { timeout: 20000, error: 'No encuentro tu curso en Seguimiento Educativo.' });
  const fichas = JSON.parse(r.valor);
  const c = normTxt(centro);
  return fichas.find(x => x.centro && normTxt(x.centro).includes(c)) || fichas.find(x => x.principal) || fichas[0];
}

const JS_HORARIO = `(() => {
  if (!document.body || !/Abreviatura/i.test(document.body.innerText)) return null;
  const tabla = [...document.querySelectorAll('table')].find(t => t.rows.length >= 2 && t.rows[0].cells.length === 6
    && /lunes/i.test(t.rows[0].cells[1].innerText) && /viernes/i.test(t.rows[0].cells[5].innerText));
  if (!tabla) return null;
  const raras = [];
  const filas = [...tabla.rows].slice(1).filter(r => { if (r.cells.length !== 6) { raras.push(r.cells.length); return false; } return true; })
    .map(r => ({ hora: r.cells[0].innerText.trim(), dias: [...r.cells].slice(1, 6).map(c => c.innerText.split('\\n').map(x => x.trim())
      .filter(x => x && !/^\\(.*\\)$/.test(x)).map(x => x.split(' - ')[0].trim())) }));
  const materias = [...document.querySelectorAll('tr')].filter(r => r.cells.length === 2 && /^[A-ZÁÉÍÓÚÑ0-9]{2,10}$/.test(r.cells[0].innerText.trim()))
    .map(r => ({ abrev: r.cells[0].innerText.trim(), nombre: r.cells[1].innerText.replace(/\\s+/g, ' ').trim() }));
  return materias.length ? JSON.stringify({ filas, materias, raras }) : null;
})()`;
async function leerHorario(log) {
  log('Leyendo tu horario…');
  await clicMenu('HORARIO', 'No encuentro «Horario» en el menú.');
  const r = await hasta(() => enFrames(JS_HORARIO), { timeout: 30000, error: 'La página del horario no se ha abierto.' });
  const h = JSON.parse(r.valor);
  if (h.raras.length) log('Aviso: filas del horario con otro formato: ' + h.raras.join(','));
  return h;
}

// ---------- Lectura completa ----------
async function leerEducamos({ cred = null, centro = 'Brianda de Mendoza', faltas = true, curso = true, log = () => {} } = {}) {
  try {
    log('Abriendo Educamos…');
    await abrirDentro(cred, log);

    log('Entrando en Seguimiento Educativo…');
    await enFrames(`(() => { const b = [...document.querySelectorAll('button,[role=button],a')].filter(e => /panel de aplicaciones/i.test((e.getAttribute('aria-label')||'') + ' ' + (e.title||''))).find(e => e.offsetParent !== null); if (b) { b.click(); return true; } return false; })()`);
    await hasta(() => enFrames(`(() => { const b = [...document.querySelectorAll('button,[role=menuitem],a')].find(e => /seguimiento educativo/i.test(e.innerText||'') && (e.innerText||'').length < 80); if (b) { b.click(); return true; } return false; })()`),
      { timeout: 20000, error: 'No encuentro «Seguimiento Educativo» en el panel de aplicaciones.' });

    // En Android, Seguimiento Educativo se abre en el mismo navegador
    await hasta(async () => /papassegedu|segedu/i.test(await Nav.url()), { timeout: 30000, error: 'Seguimiento Educativo no se ha abierto.' });

    await asegurarCentro(centro, log);

    const res = {};
    if (curso) {
      log('Leyendo tu curso…');
      res.curso = await leerCurso(centro);
      log('Curso: ' + (res.curso && res.curso.curso));
      res.horario = await leerHorario(log);
    }
    if (faltas) {
      log('Abriendo Faltas de asistencia…');
      await clicMenu('FALTAS DE ASISTENCIA', 'No encuentro «Faltas de asistencia» en el menú.');
      await hasta(() => leerTabla(), { timeout: 30000, error: 'La página de faltas no se ha abierto.' });
      log('Leyendo faltas injustificadas…');
      res.injust = await leerTodas('I', log);
      log('Leyendo faltas justificadas…');
      res.just = await leerTodas('J', log);
    }
    return res;
  } catch (e) {
    try { const u = new URL(await Nav.url()); log('Fallo en: ' + u.host + u.pathname + ' → ' + (e.codigo || '') + ' ' + e.message); } catch (x) {}
    throw e;
  } finally {
    await Nav.cargar('about:blank').catch(() => {});
  }
}

// ---------- Horas oficiales (web de FP de Castilla-La Mancha) ----------
const PREFIJO = { CFGM: 'tecnico en ', CFGS: 'tecnico superior en ', CFGB: 'tecnico basico en ', FPB: 'titulo profesional basico en ', CE: 'curso de especializacion' };

async function buscarHorasOficiales(curso, log = () => {}) {
  try {
    log('Buscando las horas oficiales de «' + curso.ciclo + '»…');
    await Nav.cargar(CONFIG.baseFP + '/fp/que-estudiar?combine=' + encodeURIComponent(curso.ciclo));
    const enlaces = JSON.parse(await hasta(() => Nav.ejecutar(`(() => { const l = [...document.querySelectorAll('a[href*="/fp/que-estudiar/"]')]
      .map(a => ({ t: (a.innerText || '').replace(/\\s+/g, ' ').trim(), h: a.href })).filter(x => x.t); return l.length ? JSON.stringify(l) : null; })()`),
      { timeout: 20000, error: 'La web oficial de FP no carga.' }));
    const ciclo = quitarTildes(curso.ciclo), pref = PREFIJO[curso.tipo] || '';
    const cand = enlaces.filter(e => quitarTildes(e.t).includes(ciclo))
      .map(e => ({ ...e, n: quitarTildes(e.t) }))
      .sort((a, b) => {
        const p = x => (/virtual|distancia/.test(x.n) ? 4 : 0) + (pref && x.n.startsWith(pref) ? 0 : 2) + (x.n.endsWith(ciclo) ? 0 : 1);
        return p(a) - p(b);
      });
    if (!cand.length) throw new Error('No encuentro «' + curso.ciclo + '» en la web oficial de FP.');
    const elegido = cand[0];
    log('Página oficial: ' + elegido.t);
    await Nav.cargar(elegido.h);
    const filas = JSON.parse(await hasta(() => Nav.ejecutar(`(() => {
      const t = [...document.querySelectorAll('table')].find(t => /horas\\s+totales/i.test(t.innerText));
      if (!t) return null;
      const f = [...t.rows].map(r => [...r.cells].map(c => (c.innerText || '').replace(/\\s+/g, ' ').trim()))
        .filter(c => c.length >= 2 && /^\\d+$/.test(c[1]) && !/^total$/i.test(c[0]))
        .map(c => ({ nombre: c[0], horas: +c[1], semana: c.slice(2).map(x => +x || 0) }));
      return f.length ? JSON.stringify(f) : null;
    })()`), { timeout: 20000, error: 'La página oficial de «' + elegido.t + '» no tiene la tabla de horas.' }));
    return { url: elegido.h, titulo: elegido.t, filas };
  } finally {
    await Nav.cargar('about:blank').catch(() => {});
  }
}
