const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, shell, powerMonitor, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const educamos = require('./educamos');
const { normalizar, comparar, MODULOS, limite, proximaLectura } = require('./logica');

// Que Educamos vea un Chrome normal
app.userAgentFallback = app.userAgentFallback.replace(/\s?Electron\/\S+/, '').replace(/\s?control-faltas-smr\/\S+/i, '');
const AUMID = 'es.smr2.controlfaltas';
app.setAppUserModelId(AUMID);
const PRUEBAS = !!process.defaultApp; // solo al ejecutarla con «npm start», nunca en el .exe
if (PRUEBAS && process.env.FALTAS_DATOS) app.setPath('userData', process.env.FALTAS_DATOS);

const ICONO = path.join(__dirname, 'icon.png');
const MIN_SESION = 10; // cada cuántos minutos se "toca" Educamos para que no cierre la sesión
let win = null, tray = null, timerReloj = null, timerSesion = null, saliendo = false;
let estado = { sincronizando: false, paso: '', error: null, sesion: 'desconocida' };

// ---------- Datos en disco ----------
const RUTA = () => path.join(app.getPath('userData'), 'datos.json');
const AJUSTES_DEF = {
  horas: {},                 // horas totales por módulo cambiadas por el usuario
  becaHoras: null,           // horas lectivas del curso para la beca (null = suma de módulos)
  becaContarJustificadas: true,
  intervaloMin: 60,
  leerSiempreAlAbrir: false,  // si es false, al abrir solo lee si ya toca según el intervalo
  notificaciones: true,
  iniciarConWindows: true,
  segundoPlano: true,
  mostrarVentanas: false,
};
let datos = { sync: null, ajustes: { ...AJUSTES_DEF }, manuales: [], cambios: [], credenciales: null, ultimoIntento: null };

function cargar() {
  try {
    const d = JSON.parse(fs.readFileSync(RUTA(), 'utf8'));
    datos = { ...datos, ...d, ajustes: { ...AJUSTES_DEF, ...(d.ajustes || {}) } };
    delete datos.ajustes.sincronizarAlAbrir; // ajuste antiguo, sustituido por leerSiempreAlAbrir
  } catch (e) {
    if (fs.existsSync(RUTA())) { try { fs.copyFileSync(RUTA(), RUTA() + '.roto-' + Date.now()); } catch (x) {} }
  }
}
function guardar() {
  try {
    fs.mkdirSync(path.dirname(RUTA()), { recursive: true });
    const tmp = RUTA() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(datos, null, 1));
    fs.renameSync(tmp, RUTA());
  } catch (e) { console.error(e); }
}
// Lo que ve la ventana: nunca la contraseña
function publico() {
  const { credenciales, ...resto } = datos;
  const prox = cuandoToca();
  return { ...resto, proximaLectura: isFinite(prox) ? new Date(Math.max(prox, Date.now())).toISOString() : null, credUsuario: credenciales ? credenciales.usuario : null, credFallo: !!(credenciales && credenciales.fallo), cifradoDisponible: safeStorage.isEncryptionAvailable(), estado, modulos: MODULOS };
}
function enviar() {
  if (win && !win.isDestroyed()) win.webContents.send('datos', publico());
  actualizarTray();
}

// ---------- Credenciales (opcional, cifradas con la cuenta de Windows) ----------
function credParaUsar() {
  const c = datos.credenciales;
  if (!c || c.fallo || !safeStorage.isEncryptionAvailable()) return null;
  try { return { usuario: c.usuario, contrasena: safeStorage.decryptString(Buffer.from(c.cifrada, 'base64')) }; }
  catch (e) { return null; }
}

// ---------- Avisos ----------
function avisar(titulo, cuerpo) {
  if (!datos.ajustes.notificaciones || !Notification.isSupported()) return;
  const n = new Notification({ title: titulo, body: cuerpo, icon: ICONO });
  n.on('click', mostrar);
  n.show();
}
const NOMBRE_CORTO = { IALP: 'Programación', IPEII: 'IPE II', PIMSM: 'Proyecto' };
const corto = c => NOMBRE_CORTO[c] || c;

function resumenCambios(cambios) {
  const g = {};
  cambios.forEach(c => { g[c.tipo] = g[c.tipo] || {}; g[c.tipo][c.m] = (g[c.tipo][c.m] || 0) + c.n; });
  const txt = (t, pal) => g[t] ? `${Object.values(g[t]).reduce((a, b) => a + b, 0)} ${pal}: ${Object.entries(g[t]).map(([m, n]) => `${corto(m)} ${n}`).join(', ')}` : null;
  return [txt('nueva', 'nuevas'), txt('justificada', 'justificadas'), txt('quitada', 'quitadas'), txt('nueva-justificada', 'nuevas ya justificadas')].filter(Boolean).join(' · ');
}

function avisosLimite(sync) {
  const horas = c => Number(datos.ajustes.horas[c]) || MODULOS.find(m => m.codigo === c).horas;
  const cnt = {};
  sync.injust.filter(x => !x.retraso).forEach(x => cnt[x.m] = (cnt[x.m] || 0) + 1);
  return MODULOS.map(m => ({ m: m.codigo, n: cnt[m.codigo] || 0, lim: limite(horas(m.codigo), 25) }))
    .filter(x => x.n >= x.lim * 0.75).map(x => `${corto(x.m)} ${x.n}/${x.lim}`);
}

// Pone el estado de la sesión y avisa solo cuando cambia a "hay que entrar"
function marcarSesion(nueva, motivo) {
  const antes = estado.sesion;
  estado.sesion = nueva;
  if (nueva === 'login' && antes !== 'login' && datos.sync) {
    avisar('Educamos: vuelve a iniciar sesión', motivo || 'Abre la app y pulsa «Iniciar sesión en Educamos» para que se sigan leyendo tus faltas.');
  }
}
function errorDeSesion(e) {
  if (e.codigo === 'credenciales' && datos.credenciales) {
    // No se reintenta con una contraseña mala (Educamos podría bloquear la cuenta)
    datos.credenciales.fallo = true; guardar();
  }
  if (e.codigo === 'login' || e.codigo === 'credenciales') { marcarSesion('login', e.message); return true; }
  return false;
}

// ---------- Lectura de Educamos ----------
async function leer() {
  return educamos.leerFaltas({ mostrar: datos.ajustes.mostrarVentanas, cred: credParaUsar(), log: p => { estado.paso = p; enviar(); } });
}

async function sincronizar(origen) {
  if (estado.sincronizando) return;
  estado = { ...estado, sincronizando: true, paso: 'Empezando…', error: null };
  enviar();
  try {
    let r = await leer();
    let nuevo = { actualizado: new Date().toISOString(), injust: normalizar(r.injust), just: normalizar(r.just) };
    // Si de golpe desaparecen muchas faltas, se lee otra vez para confirmar antes de guardar
    const prevTotal = datos.sync ? datos.sync.injust.length + datos.sync.just.length : 0;
    const nuevoTotal = nuevo.injust.length + nuevo.just.length;
    if (datos.sync && prevTotal - nuevoTotal >= Math.max(5, prevTotal * 0.2)) {
      estado.paso = 'Han desaparecido muchas faltas: lo compruebo otra vez…'; enviar();
      const r2 = await leer();
      const n2 = { injust: normalizar(r2.injust), just: normalizar(r2.just) };
      if (n2.injust.length !== nuevo.injust.length || n2.just.length !== nuevo.just.length) {
        throw Object.assign(new Error('Dos lecturas seguidas de Educamos no coinciden. No guardo nada; lo intento en la próxima lectura.'), { codigo: 'dudosa' });
      }
    }
    const cambios = comparar(datos.sync, nuevo).map(c => ({ ...c, detectado: nuevo.actualizado }));
    const anteriorLimite = datos.sync ? avisosLimite(datos.sync) : [];
    datos.sync = nuevo;
    if (cambios.length) datos.cambios = cambios.concat(datos.cambios || []).slice(0, 300);
    datos.ultimoIntento = { t: nuevo.actualizado, ok: true };
    guardar();
    estado = { sincronizando: false, paso: '', error: null, sesion: 'ok' };
    if (cambios.length) avisar('Cambios en tus faltas', resumenCambios(cambios));
    const lim = avisosLimite(nuevo).filter(x => !anteriorLimite.includes(x));
    if (lim.length && cambios.some(c => c.tipo === 'nueva')) avisar('Cuidado con el límite', 'Pasas del 75 % en: ' + lim.join(', '));
  } catch (e) {
    estado = { ...estado, sincronizando: false, paso: '', error: e.message || String(e) };
    errorDeSesion(e);
    // Si hay que entrar a mano (sin contraseña guardada o con una que falló), no se reintenta solo
    const esperaUsuario = (e.codigo === 'login' || e.codigo === 'credenciales') && !credParaUsar();
    datos.ultimoIntento = { t: new Date().toISOString(), ok: false, esperaUsuario };
    guardar();
  }
  enviar();
}

// Mantener viva la sesión solo hace falta si no hay contraseña guardada (con contraseña, la app entra sola).
async function tocarSesion() {
  if (estado.sincronizando || estado.sesion !== 'ok' || credParaUsar()) return;
  try { await educamos.mantenerSesion({}); }
  catch (e) { if (errorDeSesion(e)) enviar(); }
}

// La próxima lectura se calcula siempre desde la última lectura guardada (no se reinicia al abrir la app,
// al cambiar ajustes ni al despertar el ordenador). Un reloj interno lo mira cada minuto sin tocar Educamos.
function cuandoToca() {
  return proximaLectura({ ultimaBuena: datos.sync && datos.sync.actualizado, ultimoIntento: datos.ultimoIntento, intervaloMin: datos.ajustes.intervaloMin });
}
function comprobar() {
  if (!estado.sincronizando && Date.now() >= cuandoToca()) sincronizar('auto');
}
function programar() {
  clearInterval(timerReloj); clearInterval(timerSesion);
  timerReloj = setInterval(comprobar, 60 * 1000);
  timerSesion = setInterval(tocarSesion, MIN_SESION * 60 * 1000);
}

// ---------- Windows: inicio automático y acceso en el menú Inicio (necesario para las notificaciones) ----------
function rutaExe() { return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath; }
function aplicarInicioWindows() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!datos.ajustes.iniciarConWindows, path: rutaExe(), args: ['--oculto'] });
}
function accesoMenuInicio() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  try {
    const lnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Control de faltas SMR.lnk');
    shell.writeShortcutLink(lnk, fs.existsSync(lnk) ? 'replace' : 'create', { target: rutaExe(), appUserModelId: AUMID, description: 'Control de faltas SMR' });
  } catch (e) { console.error(e); }
}

// ---------- Ventana y bandeja ----------
function crearVentana(oculta) {
  win = new BrowserWindow({
    width: 1000, height: 780, minWidth: 420, minHeight: 500, show: !oculta,
    title: 'Control de faltas SMR', icon: ICONO, backgroundColor: '#FBFCFE',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('close', e => {
    if (!saliendo && datos.ajustes.segundoPlano) {
      e.preventDefault(); win.hide();
      if (!datos._avisoBandeja) { datos._avisoBandeja = true; guardar(); avisar('Sigo funcionando', 'La app sigue leyendo tus faltas en segundo plano. Está junto al reloj de Windows.'); }
    }
  });
}
function mostrar() { if (!win || win.isDestroyed()) crearVentana(false); win.show(); win.focus(); }

function actualizarTray() {
  if (!tray) return;
  let tip = 'Control de faltas SMR';
  if (datos.sync) tip += ` · ${datos.sync.injust.filter(x => !x.retraso).length} injustificadas`;
  if (estado.sincronizando) tip += ' · leyendo Educamos…';
  else if (estado.sesion === 'login') tip += ' · hay que iniciar sesión';
  tray.setToolTip(tip);
}
function crearTray() {
  tray = new Tray(nativeImage.createFromPath(ICONO).resize({ width: 16, height: 16 }));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir', click: mostrar },
    { label: 'Leer Educamos ahora', click: () => sincronizar('manual') },
    { type: 'separator' },
    { label: 'Salir del todo', click: () => { saliendo = true; app.quit(); } },
  ]));
  tray.on('click', mostrar);
  actualizarTray();
}

// ---------- IPC ----------
ipcMain.handle('datos:get', () => publico());
ipcMain.handle('ajustes:set', (_e, parcial) => {
  for (const k of Object.keys(parcial || {})) if (k in AJUSTES_DEF) datos.ajustes[k] = parcial[k];
  guardar(); aplicarInicioWindows(); enviar(); comprobar();
  return true;
});
ipcMain.handle('manuales:set', (_e, lista) => {
  datos.manuales = Array.isArray(lista) ? lista.slice(0, 500).map(x => ({ id: String(x.id), f: String(x.f).slice(0, 10), m: String(x.m).slice(0, 20), n: Math.max(1, Math.min(6, Number(x.n) || 1)) })) : [];
  guardar(); enviar(); return true;
});
ipcMain.handle('cambios:borrar', () => { datos.cambios = []; guardar(); enviar(); return true; });
ipcMain.handle('sync:ahora', () => { sincronizar('manual'); return true; });
ipcMain.handle('login:abrir', async () => {
  const ok = await educamos.abrirLogin();
  if (ok) { estado.sesion = 'ok'; estado.error = null; datos.ultimoIntento = null; enviar(); sincronizar('login'); }
  return ok;
});
ipcMain.handle('login:cerrar', async () => { await educamos.cerrarSesion(); estado.sesion = 'login'; enviar(); return true; });
ipcMain.handle('cred:guardar', async (_e, usuario, contrasena) => {
  usuario = String(usuario || '').trim(); contrasena = String(contrasena || '');
  if (!usuario || !contrasena) return { ok: false, msg: 'Escribe el usuario y la contraseña.' };
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, msg: 'Este ordenador no permite cifrar la contraseña; no la guardo.' };
  datos.credenciales = { usuario, cifrada: safeStorage.encryptString(contrasena).toString('base64'), fallo: false };
  datos.ultimoIntento = null; guardar(); enviar();
  if (estado.sesion !== 'ok') sincronizar('cred');
  return { ok: true };
});
ipcMain.handle('cred:borrar', () => { datos.credenciales = null; guardar(); enviar(); return true; });
ipcMain.handle('carpeta:abrir', () => shell.openPath(app.getPath('userData')));

// ---------- Arranque ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', mostrar);
  app.whenReady().then(() => {
    cargar();
    crearVentana(process.argv.includes('--oculto'));
    crearTray();
    aplicarInicioWindows();
    accesoMenuInicio();
    programar();
    setTimeout(() => { if (datos.ajustes.leerSiempreAlAbrir) sincronizar('inicio'); else comprobar(); }, 2500);
    // Al despertar el ordenador solo se lee si ya tocaba
    powerMonitor.on('resume', () => setTimeout(comprobar, 20000));
    if (PRUEBAS && process.env.FALTAS_CAPTURA) capturasDePrueba(process.env.FALTAS_CAPTURA);
    if (PRUEBAS && process.env.FALTAS_GUION) guionDePrueba(process.env.FALTAS_GUION);
  });
  app.on('before-quit', () => { saliendo = true; });
  app.on('window-all-closed', () => { if (!datos.ajustes.segundoPlano) app.quit(); });
}

// Solo para pruebas del desarrollador: ejecuta pasos en la ventana como si los hiciera el usuario
async function guionDePrueba(ruta) {
  const pasos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  for (const p of pasos) {
    await new Promise(r => setTimeout(r, p.espera || 0));
    if (p.js) await win.webContents.executeJavaScript(p.js);
    if (p.texto) fs.writeFileSync(path.join(app.getPath('userData'), 'proxima.txt'), await win.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(p.texto)}).textContent`));
    if (p.salir) { saliendo = true; app.quit(); }
  }
}

// Solo para pruebas del desarrollador: guarda capturas de las tres pestañas
async function capturasDePrueba(dir) {
  await new Promise(r => setTimeout(r, Number(process.env.FALTAS_CAPTURA_ESPERA || 30000)));
  for (const v of ['faltas', 'beca', 'ajustes']) {
    await win.webContents.executeJavaScript(`document.querySelector('[data-vista=${v}]').click()`);
    await new Promise(r => setTimeout(r, 600));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, v + '.png'), img.toPNG());
  }
  saliendo = true; app.quit();
}
