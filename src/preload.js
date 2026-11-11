const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('app', {
  datos: () => ipcRenderer.invoke('datos:get'),
  ajustes: parcial => ipcRenderer.invoke('ajustes:set', parcial),
  manuales: lista => ipcRenderer.invoke('manuales:set', lista),
  borrarCambios: () => ipcRenderer.invoke('cambios:borrar'),
  sincronizar: () => ipcRenderer.invoke('sync:ahora'),
  iniciarSesion: () => ipcRenderer.invoke('login:abrir'),
  cerrarSesion: () => ipcRenderer.invoke('login:cerrar'),
  guardarCredenciales: (u, c) => ipcRenderer.invoke('cred:guardar', u, c),
  borrarCredenciales: () => ipcRenderer.invoke('cred:borrar'),
  abrirCarpeta: () => ipcRenderer.invoke('carpeta:abrir'),
  alCambiar: fn => ipcRenderer.on('datos', (_e, d) => fn(d)),
});
