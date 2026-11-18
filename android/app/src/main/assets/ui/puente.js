// Puente entre la pantalla y Android. La pantalla (app.js) es la misma que en Windows y usa «window.app»;
// aquí se crea «window.app» con las mismas funciones, pero hablando con la parte de Android (AndroidUI).
(function () {
  let sig = 1;
  const pendientes = {};
  const oyentes = [];
  function llamar(metodo, args) {
    return new Promise(res => {
      const id = 'p' + (sig++);
      pendientes[id] = res;
      window.AndroidUI.llamar(id, metodo, JSON.stringify(args || []));
    });
  }
  // Android contesta llamando a estas dos funciones
  window.__resp = (id, valor) => { const r = pendientes[id]; delete pendientes[id]; if (r) r(valor); };
  window.__datos = d => oyentes.forEach(fn => { try { fn(d); } catch (e) { console.error(e); } });

  window.app = {
    datos: () => llamar('datos'),
    ajustes: parcial => llamar('ajustes', [parcial]),
    manuales: lista => llamar('manuales', [lista]),
    borrarCambios: () => llamar('borrarCambios'),
    sincronizar: () => llamar('sincronizar'),
    iniciarSesion: () => llamar('iniciarSesion'),
    cerrarSesion: () => llamar('cerrarSesion'),
    guardarCredenciales: (u, c) => llamar('guardarCredenciales', [u, c]),
    borrarCredenciales: () => llamar('borrarCredenciales'),
    releerCurso: () => llamar('releerCurso'),
    abrirEducamos: () => llamar('abrirEducamos'),
    abrirRegistro: () => llamar('abrirRegistro'),
    abrirCarpeta: () => Promise.resolve(false),
    alCambiar: fn => oyentes.push(fn),
  };
})();
