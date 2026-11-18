// Busca las horas oficiales de cada módulo en la web de FP de Castilla-La Mancha
// (educacion.castillalamancha.es/fp/que-estudiar), en la tabla «Duración y distribución horaria semanal».

const { BrowserWindow } = require('electron');
const { quitarTildes } = require('./logica');

const BASE = (process.defaultApp && process.env.FALTAS_PRUEBA_FP) || 'https://educacion.castillalamancha.es';
const espera = ms => new Promise(r => setTimeout(r, ms));

async function cargar(win, url) {
  await Promise.race([win.loadURL(url).catch(() => {}), espera(30000)]);
  for (let i = 0; i < 20; i++) {
    try { if (await win.webContents.executeJavaScript('document.readyState', true) === 'complete') return; } catch (e) {}
    await espera(500);
  }
}

const PREFIJO = { CFGM: 'tecnico en ', CFGS: 'tecnico superior en ', CFGB: 'tecnico basico en ', FPB: 'titulo profesional basico en ', CE: 'curso de especializacion' };

// curso: { ciclo: 'Sistemas Microinformáticos y Redes', tipo: 'CFGM' }
// Devuelve { url, titulo, filas: [{ nombre, horas, semana: [h1, h2] }] }
async function buscarHorasOficiales(curso, log = () => {}) {
  const win = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences: { contextIsolation: true, sandbox: true } });
  try {
    log('Buscando las horas oficiales de «' + curso.ciclo + '»…');
    await cargar(win, BASE + '/fp/que-estudiar?combine=' + encodeURIComponent(curso.ciclo));
    const enlaces = await win.webContents.executeJavaScript(`[...document.querySelectorAll('a[href*="/fp/que-estudiar/"]')]
      .map(a => ({ t: (a.innerText || '').replace(/\\s+/g, ' ').trim(), h: a.href })).filter(x => x.t)`, true);
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
    await cargar(win, elegido.h);
    const filas = await win.webContents.executeJavaScript(`(() => {
      const t = [...document.querySelectorAll('table')].find(t => /horas\\s+totales/i.test(t.innerText));
      if (!t) return null;
      return [...t.rows].map(r => [...r.cells].map(c => (c.innerText || '').replace(/\\s+/g, ' ').trim()))
        .filter(c => c.length >= 2 && /^\\d+$/.test(c[1]) && !/^total$/i.test(c[0]))
        .map(c => ({ nombre: c[0], horas: +c[1], semana: c.slice(2).map(x => +x || 0) }));
    })()`, true);
    if (!filas || !filas.length) throw new Error('La página oficial de «' + elegido.t + '» no tiene la tabla de horas.');
    return { url: elegido.h, titulo: elegido.t, filas };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

module.exports = { buscarHorasOficiales };
