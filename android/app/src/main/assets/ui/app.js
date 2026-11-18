(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PCT_EVAL = 25, PCT_BECA = 20;

  let D = null; // datos completos desde la app

  // ---------- cálculos ----------
  // Las asignaturas, sus horas y el horario los saca la app de Educamos y de la web oficial (no se tocan a mano)
  const modulos = () => D.modulos || [];
  const modulo = c => modulos().find(m => m.codigo === c);
  const corto = c => { const m = modulo(c); return m && m.corto ? m.corto : c; };
  const limiteDe = c => Math.floor(((modulo(c) || {}).horas || 0) * PCT_EVAL / 100);
  const horasCurso = () => modulos().reduce((s, m) => s + (m.horas || 0), 0);
  const horasDia = () => { const h = D.horario || {}; const dias = Object.values(h).map(d => Object.values(d).reduce((a, b) => a + b, 0)).filter(Boolean); return dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : 6; };

  // Una falta apuntada a mano deja de contar cuando Educamos ya tiene esa falta (mismo día y asignatura)
  function manualesVigentes() {
    const edu = {};
    const s = D.sync || { injust: [], just: [] };
    s.injust.concat(s.just).forEach(x => { if (!x.retraso) { const k = x.f + '|' + x.m; edu[k] = (edu[k] || 0) + 1; } });
    const out = [];
    (D.manuales || []).slice().sort((a, b) => a.id.localeCompare(b.id)).forEach(x => {
      const k = x.f + '|' + x.m, n = Number(x.n) || 1, cubre = Math.min(n, edu[k] || 0);
      edu[k] = (edu[k] || 0) - cubre;
      if (n - cubre > 0) out.push({ ...x, n: n - cubre });
    });
    return out;
  }

  function conteo(filtroFecha) {
    const ok = f => !filtroFecha || filtroFecha(f);
    const c = {};
    modulos().forEach(m => c[m.codigo] = { inj: 0, just: 0, mano: 0, ret: 0 });
    const s = D.sync || { injust: [], just: [] };
    const add = (m, k, n = 1) => { if (!c[m]) c[m] = { inj: 0, just: 0, mano: 0, ret: 0, desconocida: true }; c[m][k] += n; };
    s.injust.forEach(x => { if (ok(x.f)) add(x.m, x.retraso ? 'ret' : 'inj'); });
    s.just.forEach(x => { if (!x.retraso && ok(x.f)) add(x.m, 'just'); });
    manualesVigentes().forEach(x => { if (ok(x.f)) add(x.m, 'mano', Number(x.n) || 1); });
    return c;
  }
  function estadoDe(llevas, lim) {
    const uso = lim > 0 ? Math.round(llevas / lim * 100) : 0;
    if (llevas > lim) return { e: 'perdida', t: 'Has superado el límite', uso };
    if (uso >= 75) return { e: 'peligro', t: 'Cuidado, te queda poco', uso };
    if (uso >= 50) return { e: 'aviso', t: 'Vas por la mitad', uso };
    return { e: 'bien', t: 'Vas bien', uso };
  }
  const fechaLarga = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }); };
  const fechaCorta = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); };
  const hoyISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const plural = (n, s, p) => n + ' ' + (n === 1 ? s : (p || s + 's'));

  // ---------- trimestre ----------
  // 1.º: septiembre–diciembre (hasta las vacaciones de Navidad) · 2.º: enero–Semana Santa · 3.º: después de Semana Santa
  function domingoPascua(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mes - 1, dia);
  }
  function trimestreDe(fecha) {
    const y = fecha.getFullYear(), mes = fecha.getMonth() + 1;
    if (mes >= 9) return { n: 1, desde: new Date(y, 8, 1), hasta: new Date(y, 11, 31) };
    const pascua = domingoPascua(y);
    if (mes <= 8 && fecha <= pascua) return { n: 2, desde: new Date(y, 0, 1), hasta: pascua };
    return { n: 3, desde: new Date(pascua.getTime() + 864e5), hasta: new Date(y, 7, 31) };
  }
  const NOMBRE_TRIM = { 1: '1.er trimestre', 2: '2.º trimestre', 3: '3.er trimestre' };
  const HASTA_TRIM = { 1: 'hasta las vacaciones de Navidad', 2: 'hasta Semana Santa', 3: 'hasta final de curso' };

  // ---------- cabecera / avisos ----------
  function pintarSync() {
    const el = $('sync'), tx = $('sync-texto'), e = D.estado;
    el.className = 'sync';
    $('b-leer').disabled = $('b-leer2').disabled = e.sincronizando;
    if (e.sincronizando) { el.classList.add('leyendo'); tx.textContent = e.paso || 'Leyendo Educamos…'; }
    else if (e.error) { el.classList.add('mal'); tx.textContent = 'No se pudo leer Educamos' + (D.sync ? ' · datos del ' + new Date(D.sync.actualizado).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''); }
    else if (D.sync) {
      const d = new Date(D.sync.actualizado);
      el.classList.add((Date.now() - d) / 36e5 > 24 ? 'viejo' : 'ok');
      tx.textContent = 'Leído de Educamos: ' + d.toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } else tx.textContent = 'Aún no se ha leído Educamos';

    const necesitaLogin = !e.sincronizando && (e.sesion === 'login' || (!D.sync && e.error));
    $('aviso-login').classList.toggle('oculto', !necesitaLogin);
    const err = $('aviso-error');
    err.classList.toggle('oculto', !e.error || e.sesion === 'login');
    err.textContent = e.error ? 'Problema al leer Educamos: ' + e.error : '';
    $('aj-sesion').textContent = e.sesion === 'ok' ? 'Sesión de Educamos guardada en este móvil. La app lee tus faltas sola.'
      : e.sesion === 'login' ? 'No hay sesión de Educamos (o ha caducado). Pulsa «Iniciar sesión en Educamos».'
      : 'La sesión de Educamos se comprobará en la próxima lectura. Si es la primera vez, pulsa «Iniciar sesión en Educamos».';
    const cu = D.curso || {};
    $('sub-curso').textContent = [cu.etiqueta, cu.centro || D.ajustes.centro].filter(Boolean).join(' · ');
    document.title = 'Control de faltas' + (cu.etiqueta ? ' · ' + cu.etiqueta : '');
  }

  // ---------- FALTAS ----------
  function pintarFaltas() {
    const c = conteo();
    if (!modulos().length) {
      $('lista').innerHTML = '<p class="vacio">Todavía no sé tus asignaturas. Al leer Educamos, la app mira tu curso y tu horario y busca las horas oficiales de cada asignatura.</p>';
    } else {
      const filas = modulos().map(m => {
        const k = c[m.codigo], llevas = k.inj + k.mano, lim = limiteDe(m.codigo);
        return { m, k, llevas, lim, st: estadoDe(llevas, lim) };
      }).sort((a, b) => (b.llevas / (b.lim || 1)) - (a.llevas / (a.lim || 1)));
      $('lista').innerHTML = filas.map(({ m, k, llevas, lim, st }) => {
        const quedan = lim - llevas, sem = quedan > 0 && m.semana ? Math.floor(quedan / m.semana) : 0;
        const extra = [k.mano ? plural(k.mano, 'a mano', 'a mano') : '', k.just ? plural(k.just, 'justificada') + ' (no cuentan)' : '', k.ret ? plural(k.ret, 'retraso') : ''].filter(Boolean).join(' · ');
        return `<section class="asignatura ${st.e}">
          <div><div class="nombre"><span class="codigo">${esc(m.codigo)}</span> · ${esc(m.nombre)}</div>
          <div class="detalle">${m.horas} h totales${m.semana ? ' · ' + m.semana + ' h a la semana' : ''} · máximo <strong>${lim}</strong> faltas</div></div>
          <div class="cifras"><div class="grande">${llevas} <small>/ ${lim}</small></div>${extra ? `<div class="peq">${extra}</div>` : ''}</div>
          <div class="barra" aria-hidden="true"><span style="width:${Math.min(100, st.uso)}%"></span></div>
          <div class="resumen"><span class="estado">${st.t}</span>
            <span>${quedan >= 0 ? `Te quedan <strong>${quedan}</strong> faltas` : `Te has pasado en <strong>${-quedan}</strong> faltas`}</span>
            ${quedan > 0 && m.semana ? `<span>≈ ${sem >= 1 ? plural(sem, 'semana') + ' sin ir a esta asignatura' : 'menos de una semana de esta asignatura'}</span>` : ''}
            <span>${st.uso} % del límite</span></div></section>`;
      }).join('');
      const peor = filas[0];
      const total = filas.reduce((s, x) => s + x.llevas, 0);
      $('total').className = 'total ' + (peor ? peor.st.e : 'bien');
      $('total-cifra').textContent = D.sync || manualesVigentes().length ? plural(total, 'falta') + ' injustificadas' : 'Sin datos todavía';
      $('total-texto').textContent = D.sync ? `de ${horasCurso()} horas de clase del curso. Las justificadas no cuentan para la evaluación continua.` : 'Conecta Educamos para ver tus faltas.';
      $('total-peor').textContent = peor && peor.llevas ? `La que más te tiene que preocupar: ${corto(peor.m.codigo)}, con ${peor.llevas} de ${peor.lim} (${peor.st.uso} % del límite).` : '';
    }
    const desconocidas = Object.entries(c).filter(([, v]) => v.desconocida && (v.inj || v.mano));
    if (desconocidas.length) $('lista').innerHTML += `<p class="intro">Faltas en asignaturas que no salen en tu horario: ${desconocidas.map(([n, v]) => esc(n) + ' (' + (v.inj + v.mano) + ')').join(', ')}.</p>`;

    // Trimestre actual
    const t = trimestreDe(new Date());
    const dentro = f => { const [y, m, d] = f.split('-').map(Number); const x = new Date(y, m - 1, d); return x >= t.desde && x <= t.hasta; };
    const ct = conteo(dentro);
    const enTrim = Object.values(ct).reduce((s, k) => s + k.inj + k.mano, 0);
    $('trimestre').innerHTML = `Estás en el <strong>${NOMBRE_TRIM[t.n]}</strong> (${HASTA_TRIM[t.n]}). En este trimestre llevas <strong>${plural(enTrim, 'falta')} injustificada${enTrim === 1 ? '' : 's'}</strong>.`;

    pintarCambios(); pintarHistorial();
  }

  const TEXTO_CAMBIO = {
    'nueva': 'Nueva', 'justificada': 'Justificada', 'quitada': 'Quitada',
    'nueva-justificada': 'Nueva justificada', 'justificada-quitada': 'Justificada quitada',
  };
  const EXPLICA = {
    'nueva': 'falta injustificada nueva', 'justificada': 'te la han justificado (ya no cuenta)', 'quitada': 'la han quitado de Educamos',
    'nueva-justificada': 'falta nueva, ya justificada', 'justificada-quitada': 'han quitado una falta justificada',
  };
  function pintarCambios() {
    const l = (D.cambios || []).slice(0, 40);
    $('cambios').innerHTML = l.length ? l.map(x => `<div class="cambio"><span class="etiqueta ${esc(x.tipo)}">${esc(TEXTO_CAMBIO[x.tipo] || x.tipo)}</span>
      <span><strong>${esc(corto(x.m))}</strong>${x.n > 1 ? ' ×' + Number(x.n) : ''} · ${fechaCorta(x.f)} — ${EXPLICA[x.tipo] || ''}</span>
      <span class="cuando">visto ${new Date(x.detectado).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span></div>`).join('')
      : `<p class="vacio">${D.sync ? 'Sin cambios desde que la app empezó a leer Educamos.' : 'Aparecerán aquí cuando la app lea Educamos más de una vez.'}</p>`;
  }

  function pintarHistorial() {
    const sel = $('ap-mod');
    const opciones = modulos().map(m => `<option value="${esc(m.codigo)}">${esc(corto(m.codigo))} · ${esc(m.nombre)}</option>`).join('');
    if (sel.dataset.firma !== opciones) { sel.innerHTML = opciones; sel.dataset.firma = opciones; }
    if (!$('ap-fecha').value) $('ap-fecha').value = hoyISO();
    const dias = {};
    const dia = f => (dias[f] = dias[f] || { inj: {}, just: {}, ret: {}, mano: [], completoI: 0, completoJ: 0 });
    const s = D.sync || { injust: [], just: [] };
    s.injust.forEach(x => {
      if (x.completo && !x.retraso) { dia(x.f).completoI++; return; }
      const o = x.retraso ? dia(x.f).ret : dia(x.f).inj; o[x.m] = (o[x.m] || 0) + 1;
    });
    s.just.forEach(x => {
      if (x.completo) { dia(x.f).completoJ++; return; }
      const o = dia(x.f).just; o[x.m] = (o[x.m] || 0) + 1;
    });
    manualesVigentes().forEach(x => dia(x.f).mano.push(x));
    const claves = Object.keys(dias).sort().reverse();
    const chip = (o, cls, suf = '') => Object.entries(o).map(([m, k]) => `<span class="chip ${cls}">${esc(corto(m))}${k > 1 ? ' ×' + k : ''}${suf}</span>`).join('');
    $('hist').innerHTML = claves.length ? claves.map(f => {
      const d = dias[f];
      const n = Object.values(d.inj).reduce((a, b) => a + b, 0) + d.completoI + d.mano.reduce((a, x) => a + (Number(x.n) || 1), 0);
      return `<div class="dia-hist"><div class="fecha">${fechaLarga(f)}${n ? ` · ${plural(n, 'falta')} que cuenta${n === 1 ? '' : 'n'}` : ''}</div><div class="chips">
        ${d.completoI ? `<span class="chip">Día completo (${d.completoI} h)</span>` : ''}${d.completoJ ? `<span class="chip just">Día completo justificado (${d.completoJ} h)</span>` : ''}
        ${chip(d.inj, '')}${chip(d.just, 'just')}${chip(d.ret, 'ret', ' (retraso)')}
        ${d.mano.map(x => `<span class="chip mano">${esc(corto(x.m))}${x.n > 1 ? ' ×' + x.n : ''} (a mano)<button type="button" data-borrar="${esc(x.id)}" aria-label="Borrar esta falta apuntada a mano">×</button></span>`).join('')}
      </div></div>`;
    }).join('') : '<p class="vacio">No hay faltas.</p>';
  }

  // ---------- BECA (solo injustificadas y a mano) ----------
  const becaLimite = () => Math.floor(horasCurso() * PCT_BECA / 100);
  const becaCuenta = c => Object.values(c).reduce((s, k) => s + k.inj + k.mano, 0);
  function pintarBeca() {
    const c = conteo(), cuenta = becaCuenta(c), lim = becaLimite(), horas = horasCurso();
    const st = estadoDe(cuenta, lim), quedan = lim - cuenta;
    $('beca-total').className = 'total ' + st.e;
    $('beca-cifra').textContent = horas ? `${cuenta} de ${lim} horas` : 'Sin datos todavía';
    $('beca-texto').textContent = horas ? `Para no perder la beca tienes que ir al 80 % de las ${horas} horas del curso: puedes faltar como mucho ${lim} horas (20 %). Solo se cuentan las faltas injustificadas.` : '';
    $('beca-barra').parentElement.className = 'barra grande ' + st.e;
    $('beca-barra').style.width = Math.min(100, st.uso) + '%';
    $('beca-resumen').innerHTML = !horas ? '' : `<span class="estado" style="color:var(--${st.e === 'bien' ? 'bien' : st.e === 'aviso' ? 'aviso' : 'peligro'})">${st.e === 'perdida' ? 'Has pasado el 20 %' : st.t}</span>
      <span>${quedan >= 0 ? `Te quedan <strong>${quedan}</strong> horas` : `Te has pasado en <strong>${-quedan}</strong> horas`}</span>
      ${quedan > 0 ? `<span>≈ ${plural(Math.floor(quedan / horasDia()), 'día entero', 'días enteros')} de clase</span>` : ''}
      <span>Has faltado al ${(cuenta / horas * 100).toFixed(1).replace('.', ',')} % del curso</span>`;
    let ti = 0, tm = 0, tc = 0;
    $('beca-tabla').innerHTML = Object.entries(c).filter(([, k]) => !k.desconocida || k.inj || k.mano).map(([m, k]) => {
      const cu = k.inj + k.mano; ti += k.inj; tm += k.mano; tc += cu;
      return `<tr><td>${esc(corto(m))}</td><td>${k.inj}</td><td>${k.mano}</td><td>${cu}</td></tr>`;
    }).join('') + `<tr><td><strong>Total</strong></td><td><strong>${ti}</strong></td><td><strong>${tm}</strong></td><td><strong>${tc}</strong></td></tr>`;
  }

  // ---------- AJUSTES ----------
  function aplicarTema(t) { document.documentElement.dataset.tema = ['blanco', 'negro', 'azul'].includes(t) ? t : 'azul'; }
  function pintarAjustes() {
    const a = D.ajustes;
    aplicarTema(a.tema);
    document.querySelectorAll('input[name=tema]').forEach(r => { r.checked = r.value === (a.tema || 'azul'); });
    $('cred-estado').textContent = !D.cifradoDisponible ? 'Este móvil no permite cifrar contraseñas, así que esta opción no está disponible.'
      : D.credFallo ? `La contraseña guardada para «${D.credUsuario}» no funcionó y he dejado de usarla para que Educamos no bloquee tu cuenta. Vuelve a guardarla.`
      : D.credUsuario ? `Guardado: entra sola como «${D.credUsuario}» cuando haga falta.` : 'No hay usuario guardado: si la sesión caduca, te avisaré para que entres tú.';
    $('aj-intervalo').value = String(a.intervaloMin);
    $('aj-alabrir').checked = !!a.leerSiempreAlAbrir;
    if (document.activeElement !== $('aj-centro')) $('aj-centro').value = a.centro || '';
    $('aj-version').textContent = 'Versión ' + (D.version || '');
    const iv = Number(a.intervaloMin) || 60, ivTxt = iv % 60 ? iv + ' minutos' : plural(iv / 60, 'hora');
    let prox;
    if (D.estado.sincronizando) prox = 'Leyendo Educamos ahora.';
    else if (!D.proximaLectura) prox = 'No volverá a leer sola hasta que inicies sesión en Educamos.';
    else {
      const p = new Date(D.proximaLectura), hoy = new Date();
      const cuando = p - hoy < 90000 ? 'en un momento' : (p.toDateString() === hoy.toDateString() ? 'hoy' : p.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })) + ' a las ' + p.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      prox = `Próxima lectura de faltas: ${cuando}. Se cuenta ${ivTxt} desde la última lectura, aunque cierres la app o apagues el móvil (si el móvil está apagado, lee en cuanto se encienda).`;
    }
    $('aj-proxima').textContent = prox + (D.credUsuario && !D.credFallo ? '' : ' Mientras no guardes tu usuario y contraseña, la app entra en Educamos cada 15 minutos más o menos (sin leer las faltas) para que no se cierre la sesión.');
    $('aj-notif').checked = !!a.notificaciones;
    $('aj-ventanas').checked = !!a.mostrarVentanas;
    $('aj-inicio').checked = !!a.iniciarConWindows;
    $('aj-fondo').checked = !!a.segundoPlano;
    const cu = D.curso;
    $('aj-curso').innerHTML = cu && cu.actualizado
      ? `${esc(cu.etiqueta || '')}${cu.ciclo ? ' — ' + esc(cu.ciclo) : ''}. ${plural(modulos().length, 'asignatura')} de tu horario, ${horasCurso()} horas en total. Horas sacadas de la web oficial de la Junta${cu.urlHoras ? ' (' + esc(cu.urlHoras.replace(/^https?:\/\//, '')) + ')' : ''} el ${new Date(cu.actualizado).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.${cu.aviso ? ' <strong>' + esc(cu.aviso) + '</strong>' : ''}`
      : 'Todavía no se ha leído tu curso. Se lee de Educamos al abrir la app.';
  }

  function pintarTodo() { if (!D) return; pintarSync(); pintarFaltas(); pintarBeca(); pintarAjustes(); }

  // ---------- eventos ----------
  document.querySelectorAll('nav.tabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('nav.tabs button').forEach(x => x.removeAttribute('aria-current'));
    b.setAttribute('aria-current', 'page');
    ['faltas', 'beca', 'ajustes'].forEach(v => $('v-' + v).hidden = v !== b.dataset.vista);
    window.scrollTo(0, 0);
  }));
  const leer = () => window.app.sincronizar();
  $('b-leer').addEventListener('click', leer); $('b-leer2').addEventListener('click', leer);
  const login = async () => { const ok = await window.app.iniciarSesion(); $('aj-msg').textContent = ok ? 'Sesión iniciada. Leyendo tus faltas…' : 'No se ha completado el inicio de sesión.'; };
  $('b-login').addEventListener('click', login); $('b-login-aviso').addEventListener('click', login);
  $('b-logout').addEventListener('click', async () => { await window.app.cerrarSesion(); $('aj-msg').textContent = 'Sesión de Educamos borrada de este móvil.'; });
  $('form-cred').addEventListener('submit', async ev => {
    ev.preventDefault();
    const r = await window.app.guardarCredenciales($('cred-usuario').value, $('cred-pass').value);
    $('cred-pass').value = '';
    $('aj-msg').textContent = r.ok ? 'Usuario y contraseña guardados (cifrados).' : r.msg;
  });
  $('b-cred-borrar').addEventListener('click', async () => { await window.app.borrarCredenciales(); $('cred-usuario').value = ''; $('cred-pass').value = ''; $('aj-msg').textContent = 'Usuario y contraseña borrados de este móvil.'; });
  $('b-carpeta').addEventListener('click', () => window.app.abrirCarpeta());
  $('b-releer-curso').addEventListener('click', async () => { await window.app.releerCurso(); $('aj-msg').textContent = 'Leyendo tu curso, tu horario y las horas oficiales…'; });
  $('b-abrir-educamos').addEventListener('click', () => { window.app.abrirEducamos(); $('aj-msg').textContent = 'Se ha abierto Educamos. Elige tu centro, vuelve atrás y pulsa «Leer Educamos ahora».'; });
  $('b-registro').addEventListener('click', () => window.app.abrirRegistro());
  $('aj-centro').addEventListener('change', e => { window.app.ajustes({ centro: e.target.value.trim() || 'Brianda de Mendoza' }); $('aj-msg').textContent = 'Centro guardado.'; });
  $('b-borrar-cambios').addEventListener('click', async () => { await window.app.borrarCambios(); $('aj-msg').textContent = 'Lista de cambios borrada.'; });
  document.querySelectorAll('input[name=tema]').forEach(r => r.addEventListener('change', () => { aplicarTema(r.value); window.app.ajustes({ tema: r.value }); }));

  const ajuste = (id, clave, conv) => $(id).addEventListener('change', e => { const v = conv(e.target); window.app.ajustes({ [clave]: v }); $('aj-msg').textContent = 'Guardado.'; });
  ajuste('aj-intervalo', 'intervaloMin', t => Number(t.value));
  ajuste('aj-alabrir', 'leerSiempreAlAbrir', t => t.checked);
  ajuste('aj-notif', 'notificaciones', t => t.checked);
  ajuste('aj-ventanas', 'mostrarVentanas', t => t.checked);
  ajuste('aj-inicio', 'iniciarConWindows', t => t.checked);
  ajuste('aj-fondo', 'segundoPlano', t => t.checked);

  $('form-apuntar').addEventListener('submit', ev => {
    ev.preventDefault();
    const f = $('ap-fecha').value, m = $('ap-mod').value, n = Math.max(1, Math.min(6, parseInt($('ap-horas').value, 10) || 1));
    if (!f || !m) return;
    window.app.manuales((D.manuales || []).concat([{ id: Date.now().toString(36), f, m, n }]));
    $('ap-msg').textContent = `Apuntada: ${n} h de ${corto(m)}. Dejará de contar sola cuando salga en Educamos.`;
  });
  $('hist').addEventListener('click', e => {
    const id = e.target.dataset && e.target.dataset.borrar; if (!id) return;
    window.app.manuales((D.manuales || []).filter(x => x.id !== id));
  });

  window.app.alCambiar(d => { D = d; pintarTodo(); });
  window.app.datos().then(d => { D = d; pintarTodo(); });
})();
