// Lector de faltas de EducamosCLM.
// Abre Educamos en ventanas ocultas con la sesión guardada en este ordenador,
// entra en Seguimiento Educativo → Faltas de asistencia y lee las faltas injustificadas y justificadas.
// Si la sesión ha caducado y el usuario ha guardado su usuario y contraseña en la app (cifrados por Windows),
// rellena él solo el formulario de entrada de Educamos.

const { BrowserWindow, session } = require('electron');

const PARTICION = 'persist:educamos';
const PRUEBAS = !!process.defaultApp; // solo al ejecutarla con «npm start», nunca en el .exe
const URL_INICIO = (PRUEBAS && process.env.FALTAS_PRUEBA_URL) || 'https://educamosclm.castillalamancha.es/s/home';
const HOST_EDUCAMOS = new URL(URL_INICIO).host;
const HOST_SSO = (PRUEBAS && process.env.FALTAS_PRUEBA_SSO) || 'cerbero.jccm.es';
const HOSTS_CLAVE = ['clave.gob.es'];

const espera = ms => new Promise(r => setTimeout(r, ms));

class ErrorEducamos extends Error {
  constructor(codigo, mensaje) { super(mensaje); this.codigo = codigo; }
}

function hostDe(url) { try { return new URL(url).host; } catch (e) { return ''; } }
const esSSO = url => hostDe(url) === HOST_SSO;
const esClave = url => HOSTS_CLAVE.some(x => hostDe(url) === x || hostDe(url).endsWith('.' + x));

function nuevaVentana(mostrar) {
  const w = new BrowserWindow({
    show: !!mostrar, width: 1200, height: 800, title: 'EducamosCLM',
    webPreferences: { partition: PARTICION, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  w.setMenuBarVisibility(false);
  return w;
}

// executeJavaScript puede quedarse colgado si el frame se recarga a la vez: se le pone un límite
function ejecutar(objetivo, codigo, ms = 6000) {
  return Promise.race([
    objetivo.executeJavaScript(codigo, true),
    new Promise((_, rej) => setTimeout(() => rej(new Error('js-timeout')), ms)),
  ]);
}

// Ejecuta JS en todos los frames de una ventana y devuelve el primer resultado "verdadero"
async function enFrames(win, codigo) {
  if (!win || win.isDestroyed()) throw new ErrorEducamos('ventana', 'La ventana de Educamos se ha cerrado.');
  for (const f of win.webContents.mainFrame.framesInSubtree) {
    try {
      const r = await ejecutar(f, codigo);
      if (r) return { frame: f, valor: r };
    } catch (e) { /* frame cargando: se ignora */ }
  }
  return null;
}

async function hasta(fn, { timeout = 30000, cada = 700, error = 'Educamos tarda demasiado en responder.' } = {}) {
  const fin = Date.now() + timeout;
  while (Date.now() < fin) {
    const r = await fn();
    if (r) return r;
    await espera(cada);
  }
  throw new ErrorEducamos('tiempo', error);
}

// ¿Está dentro de Educamos (sesión iniciada)?
const JS_DENTRO = `(() => !![...document.querySelectorAll('button,[role=button],a')].find(e => /panel de aplicaciones/i.test((e.getAttribute('aria-label')||'') + ' ' + (e.title||''))))()`;
// ¿Está en la pantalla de entrada, ya cargada? (no en un salto intermedio de la redirección)
const JS_FORM_LOGIN = `(() => document.readyState === 'complete' && !!document.querySelector('#kc-form-login, #username'))()`;

// Devuelve 'ok' (dentro) o 'login' (pide usuario). Espera a que acaben las redirecciones.
async function estadoSesion(win) {
  return hasta(async () => {
    if (win.isDestroyed()) throw new ErrorEducamos('ventana', 'La ventana de Educamos se ha cerrado.');
    const url = win.webContents.getURL();
    if (esClave(url)) return 'login';
    if (esSSO(url)) {
      try { if (await ejecutar(win.webContents, JS_FORM_LOGIN)) return 'login'; } catch (e) {}
    } else if (hostDe(url) === HOST_EDUCAMOS) {
      try { if (await ejecutar(win.webContents, JS_DENTRO)) return 'ok'; } catch (e) {}
    }
    return null;
  }, { timeout: 45000, error: 'Educamos no responde (¿sin internet o la web está caída?).' });
}

// Rellena el formulario de entrada con el usuario y la contraseña guardados y espera a entrar
async function entrarConCredenciales(win, cred) {
  const ok = await ejecutar(win.webContents, `(() => {
    const sw = document.getElementById('showHidePassForm');
    if (sw && !sw.checked) sw.click();
    const u = document.getElementById('username'), p = document.getElementById('password'), b = document.getElementById('kc-login');
    if (!u || !p || !b) return false;
    const poner = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    poner(u, ${JSON.stringify(cred.usuario)}); poner(p, ${JSON.stringify(cred.contrasena)});
    b.click(); return true;
  })()`).catch(() => false);
  if (!ok) throw new ErrorEducamos('login', 'No encuentro el formulario de entrada de Educamos.');
  await espera(2500);
  const r = await hasta(async () => {
    const url = win.webContents.getURL();
    if (hostDe(url) === HOST_EDUCAMOS) {
      try { if (await ejecutar(win.webContents, JS_DENTRO)) return 'ok'; } catch (e) {}
    } else if (esSSO(url)) {
      // Sigue en la pantalla de entrada con un mensaje de error: usuario o contraseña mal
      try {
        const err = await ejecutar(win.webContents, `(() => document.readyState === 'complete' && !!document.querySelector('#kc-form-login') && !!document.querySelector('#input-error, .kc-feedback-text, .alert-error, [class*=error]'))()`);
        if (err) return 'mal';
      } catch (e) {}
    }
    return null;
  }, { timeout: 40000, error: 'Educamos no termina de iniciar sesión.' });
  if (r === 'mal') throw new ErrorEducamos('credenciales', 'Educamos dice que el usuario o la contraseña guardados no son correctos. Vuelve a guardarlos en Ajustes.');
}

// Abre Educamos y deja la sesión iniciada (si hace falta y hay credenciales, entra sola)
async function abrirDentro(win, cred, log) {
  await Promise.race([win.loadURL(URL_INICIO).catch(() => {}), espera(40000)]);
  let est = await estadoSesion(win);
  if (est === 'login') {
    if (!cred) throw new ErrorEducamos('login', 'La sesión de Educamos ha caducado. Pulsa «Iniciar sesión en Educamos».');
    if (esClave(win.webContents.getURL())) throw new ErrorEducamos('login', 'Educamos pide Cl@ve; así no puedo entrar sola. Pulsa «Iniciar sesión en Educamos».');
    log('Iniciando sesión en Educamos…');
    await entrarConCredenciales(win, cred);
  }
}

// Mantiene viva la sesión (Educamos la cierra si pasa un rato sin usarse)
async function mantenerSesion({ cred = null } = {}) {
  const win = nuevaVentana(false);
  try { await abrirDentro(win, cred, () => {}); return 'ok'; }
  finally { if (!win.isDestroyed()) win.destroy(); }
}

// Ventana visible para que el usuario inicie sesión él mismo
function abrirLogin() {
  return new Promise(resolve => {
    const w = nuevaVentana(true);
    w.setTitle('Inicia sesión en EducamosCLM (esta ventana se cerrará sola al entrar)');
    let terminado = false;
    const t = setInterval(async () => {
      if (w.isDestroyed()) return;
      if (hostDe(w.webContents.getURL()) === HOST_EDUCAMOS) {
        try { if (await ejecutar(w.webContents, JS_DENTRO)) { await espera(1500); fin(true); } } catch (e) {}
      }
    }, 1500);
    const fin = ok => { if (terminado) return; terminado = true; clearInterval(t); if (!w.isDestroyed()) w.close(); resolve(ok); };
    w.on('closed', () => fin(false));
    w.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { webPreferences: { partition: PARTICION } } }));
    w.loadURL(URL_INICIO).catch(() => {});
  });
}

async function cerrarSesion() {
  const s = session.fromPartition(PARTICION);
  await s.clearStorageData();
  await s.clearCache();
}

// ---------- Lectura de la tabla de faltas (se ejecuta dentro del frame) ----------
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
  return JSON.stringify({ conv: s.value, estado: est ? est.value : null, desde: m ? +m[1] : null, hasta: m ? +m[2] : null, total: m ? +m[3] : null, registros: reg ? +reg[1] : null,
    cabecera, filas, listo: document.readyState, marca: window.__marcaFaltas || null });
})()`;

async function leerTabla(win) {
  const r = await enFrames(win, JS_LEER_TABLA);
  return r ? { frame: r.frame, datos: JSON.parse(r.valor) } : null;
}
// Solo el contenido de la tabla (no los desplegables, que cambian antes de que llegue la tabla nueva)
const firmaDe = d => JSON.stringify([d.total, d.desde, d.filas]);

// Pone "Todas las convocatorias" y el tipo de falta, y espera a que la tabla se recargue de verdad
async function ponerFiltro(win, estado) {
  const marca = 'm' + Date.now() + Math.random().toString(36).slice(2);
  const antes = await leerTabla(win);
  const r = await enFrames(win, `(() => {
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
    const t = await leerTabla(win);
    if (!t || t.datos.conv !== '-2' || t.datos.estado !== estado || t.datos.listo !== 'complete' || !t.datos.cabecera) return null;
    // Si ha cambiado algo, la tabla tiene que ser nueva: otra página cargada (sin marca) o contenido distinto.
    if (r.valor === 'cambiado' && t.datos.marca === marca && firmaDe(t.datos) === firmaAntes && Date.now() - inicio < 20000) return null;
    const firma = firmaDe(t.datos);
    if (firma === previa) return t; // dos lecturas iguales seguidas: estable
    previa = firma; return null;
  }, { timeout: 45000, cada: 1500, error: 'La página de faltas no termina de cargar.' });
}

async function irAPagina(win, n, tam) {
  const r = await enFrames(win, `(() => { if (typeof irAPagina === 'function' && document.querySelector('select[name=X_CONVCENTRO]')) { irAPagina(${n}); return true; } return false; })()`);
  if (!r) throw new ErrorEducamos('estructura', 'No puedo cambiar de página en la lista de faltas.');
  const desdeEsperado = (n - 1) * tam + 1;
  return hasta(async () => {
    const t = await leerTabla(win);
    return t && t.datos.desde === desdeEsperado && t.datos.listo === 'complete' && t.datos.filas.length ? t : null;
  }, { timeout: 30000, cada: 800, error: 'No carga la página ' + n + ' de la lista de faltas.' });
}

async function leerTodas(win, estado) {
  const nombre = estado === 'I' ? 'injustificadas' : 'justificadas';
  let t = await ponerFiltro(win, estado);
  const d = t.datos;
  if (d.total == null) {
    // Sin paginador: caben en una sola página. Educamos pone «Número total de registros: N».
    if (d.registros != null && d.registros !== d.filas.length) {
      throw new ErrorEducamos('recuento', `Educamos dice ${d.registros} faltas ${nombre} pero he leído ${d.filas.length}. No guardo nada para no meter datos mal.`);
    }
    if (d.registros == null && d.filas.length > 0) throw new ErrorEducamos('estructura', `No encuentro el total de faltas ${nombre} en la página.`);
    return d.filas;
  }
  if (d.total === 0) return [];
  const tam = Math.max(1, (d.hasta - d.desde + 1) || d.filas.length || 25);
  if (d.desde !== 1) t = await irAPagina(win, 1, tam);
  let filas = t.datos.filas.slice();
  const paginas = Math.ceil(d.total / tam);
  for (let p = 2; p <= paginas; p++) filas = filas.concat((await irAPagina(win, p, tam)).datos.filas);
  if (filas.length !== d.total) {
    throw new ErrorEducamos('recuento', `Educamos dice ${d.total} faltas ${nombre} pero he leído ${filas.length}. No guardo nada para no meter datos mal.`);
  }
  return filas;
}

// ---------- Lectura completa ----------
async function leerFaltas({ mostrar = false, cred = null, log = () => {} } = {}) {
  const win = nuevaVentana(mostrar);
  const hijas = [];
  win.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: { show: !!mostrar, webPreferences: { partition: PARTICION, backgroundThrottling: false } },
  }));
  win.webContents.on('did-create-window', w => hijas.push(w));
  const cerrarTodo = () => { [win, ...hijas].forEach(w => { try { if (!w.isDestroyed()) w.destroy(); } catch (e) {} }); };

  try {
    log('Abriendo Educamos…');
    await abrirDentro(win, cred, log);

    log('Entrando en Seguimiento Educativo…');
    await enFrames(win, `(() => { const b = [...document.querySelectorAll('button,[role=button],a')].filter(e => /panel de aplicaciones/i.test((e.getAttribute('aria-label')||'') + ' ' + (e.title||''))).find(e => e.offsetParent !== null); if (b) { b.click(); return true; } return false; })()`);
    await hasta(() => enFrames(win, `(() => { const b = [...document.querySelectorAll('button,[role=menuitem],a')].find(e => /seguimiento educativo/i.test(e.innerText||'') && (e.innerText||'').length < 80); if (b) { b.click(); return true; } return false; })()`),
      { timeout: 20000, error: 'No encuentro «Seguimiento Educativo» en el panel de aplicaciones.' });

    // Seguimiento se abre en otra ventana (o en la misma)
    const seg = await hasta(() => {
      const h = hijas.find(w => !w.isDestroyed() && /papassegedu|segedu/i.test(w.webContents.getURL()));
      if (h) return h;
      if (/papassegedu|segedu/i.test(win.webContents.getURL())) return win;
      return null;
    }, { timeout: 30000, error: 'Seguimiento Educativo no se ha abierto.' });

    log('Abriendo Faltas de asistencia…');
    const JS_CLIC_FALTAS = `(() => {
      const norm = s => (s||'').replace(/\\s+/g,' ').trim().toUpperCase();
      const cands = [...document.querySelectorAll('a,li,span,div,td,button')].filter(e => norm(e.innerText || e.textContent) === 'FALTAS DE ASISTENCIA');
      if (!cands.length) return false;
      const el = cands.find(e => e.tagName === 'A') || cands[cands.length - 1];
      el.click(); return true;
    })()`;
    const clic = await hasta(() => enFrames(seg, JS_CLIC_FALTAS), { timeout: 20000 }).catch(() => null);
    if (!clic) {
      await enFrames(seg, `(() => { const e = [...document.querySelectorAll('a,li,span,div')].find(x => (x.innerText||'').replace(/\\s+/g,' ').trim().toUpperCase() === 'SEGUIMIENTO DEL CURSO'); if (e) { e.click(); return true; } return false; })()`);
      await espera(1500);
      await hasta(() => enFrames(seg, JS_CLIC_FALTAS), { timeout: 15000, error: 'No encuentro «Faltas de asistencia» en el menú.' });
    }
    await hasta(() => leerTabla(seg), { timeout: 30000, error: 'La página de faltas no se ha abierto.' });

    log('Leyendo faltas injustificadas…');
    const injust = await leerTodas(seg, 'I');
    log('Leyendo faltas justificadas…');
    const just = await leerTodas(seg, 'J');
    return { injust, just };
  } finally {
    cerrarTodo();
  }
}

module.exports = { leerFaltas, mantenerSesion, abrirLogin, cerrarSesion, ErrorEducamos };
