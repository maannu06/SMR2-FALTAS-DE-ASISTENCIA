(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CORTO = { IALP: 'Programación', IPEII: 'IPE II', PIMSM: 'Proyecto' };
  const corto = c => CORTO[c] || c;
  const PCT_EVAL = 25, PCT_BECA = 20, HORAS_DIA = 6;
  // Horas de cada asignatura por día (horario de Educamos, curso 26/27)
  const HORARIO = {
    1: { nombre: 'Lunes',     h: { APOF: 1, IPEII: 1, SRED: 2, SR: 2 } },
    2: { nombre: 'Martes',    h: { IALP: 2, SEIN: 2, APOF: 2 } },
    3: { nombre: 'Miércoles', h: { SR: 1, IALP: 2, IPEII: 1, SRED: 2 } },
    4: { nombre: 'Jueves',    h: { PIMSM: 1, SEIN: 2, APOF: 2, IPEII: 1 } },
    5: { nombre: 'Viernes',   h: { SR: 2, SRED: 2, APOF: 2 } },
  };

  let D = null; // datos completos desde la app
  let diaSel = null;

  // ---------- cálculos ----------
  const modulos = () => D.modulos;
  const oficial = c => modulos().find(m => m.codigo === c).horas;
  const horasDe = c => Number(D.ajustes.horas && D.ajustes.horas[c]) || oficial(c);
  const limiteDe = (c, pct = PCT_EVAL) => Math.floor(horasDe(c) * pct / 100);
  const horasCurso = () => modulos().reduce((s, m) => s + horasDe(m.codigo), 0);
  const becaHoras = () => Number(D.ajustes.becaHoras) || horasCurso();
  // Una falta apuntada a mano deja de contar cuando Educamos ya tiene esa falta (mismo día y asignatura),
  // sea justificada o no. Así no se cuenta dos veces.
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

  function conteo() {
    const c = {};
    modulos().forEach(m => c[m.codigo] = { inj: 0, just: 0, mano: 0, ret: 0 });
    const s = D.sync || { injust: [], just: [] };
    const add = (m, k, n = 1) => { if (!c[m]) c[m] = { inj: 0, just: 0, mano: 0, ret: 0, desconocida: true }; c[m][k] += n; };
    s.injust.forEach(x => add(x.m, x.retraso ? 'ret' : 'inj'));
    s.just.forEach(x => { if (!x.retraso) add(x.m, 'just'); });
    manualesVigentes().forEach(x => add(x.m, 'mano', Number(x.n) || 1));
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
    $('aj-sesion').textContent = e.sesion === 'ok' ? 'Sesión de Educamos guardada en este ordenador. La app lee tus faltas sola.'
      : e.sesion === 'login' ? 'No hay sesión de Educamos (o ha caducado). Pulsa «Iniciar sesión en Educamos».'
      : 'La sesión de Educamos se comprobará en la próxima lectura. Si es la primera vez, pulsa «Iniciar sesión en Educamos».';
  }

  // ---------- FALTAS ----------
  function pintarFaltas() {
    const c = conteo();
    const filas = modulos().map(m => {
      const k = c[m.codigo], llevas = k.inj + k.mano, lim = limiteDe(m.codigo);
      return { m, k, llevas, lim, st: estadoDe(llevas, lim) };
    }).sort((a, b) => (b.llevas / b.lim) - (a.llevas / a.lim));

    $('lista').innerHTML = filas.map(({ m, k, llevas, lim, st }) => {
      const quedan = lim - llevas, sem = quedan > 0 ? Math.floor(quedan / m.semana) : 0;
      const extra = [k.mano ? plural(k.mano, 'a mano', 'a mano') : '', k.just ? plural(k.just, 'justificada') + ' (no cuentan)' : '', k.ret ? plural(k.ret, 'retraso') : ''].filter(Boolean).join(' · ');
      return `<section class="asignatura ${st.e}">
        <div><div class="nombre"><span class="codigo">${m.codigo}</span> · ${esc(m.nombre)}</div>
        <div class="detalle">${horasDe(m.codigo)} h totales · ${m.semana} h a la semana · máximo <strong>${lim}</strong> faltas</div></div>
        <div class="cifras"><div class="grande">${llevas} <small>/ ${lim}</small></div>${extra ? `<div class="peq">${extra}</div>` : ''}</div>
        <div class="barra" aria-hidden="true"><span style="width:${Math.min(100, st.uso)}%"></span></div>
        <div class="resumen"><span class="estado">${st.t}</span>
          <span>${quedan >= 0 ? `Te quedan <strong>${quedan}</strong> faltas` : `Te has pasado en <strong>${-quedan}</strong> faltas`}</span>
          ${quedan > 0 ? `<span>≈ ${sem >= 1 ? plural(sem, 'semana') + ' sin ir a esta asignatura' : 'menos de una semana de esta asignatura'}</span>` : ''}
          <span>${st.uso} % del límite</span></div></section>`;
    }).join('');

    const desconocidas = Object.entries(c).filter(([, v]) => v.desconocida);
    if (desconocidas.length) $('lista').innerHTML += `<p class="intro">Faltas en asignaturas que la app no conoce: ${desconocidas.map(([n, v]) => esc(n) + ' (' + v.inj + ')').join(', ')}.</p>`;

    const total = filas.reduce((s, x) => s + x.llevas, 0);
    const peor = filas[0];
    $('total').className = 'total ' + (peor ? peor.st.e : 'bien');
    $('total-cifra').textContent = D.sync || manualesVigentes().length ? plural(total, 'falta') + ' injustificadas' : 'Sin datos todavía';
    $('total-texto').textContent = D.sync ? `de ${horasCurso()} horas de clase del curso. Las justificadas no cuentan para la evaluación continua.` : 'Conecta Educamos para ver tus faltas.';
    $('total-peor').textContent = peor && peor.llevas ? `La que más te tiene que preocupar: ${corto(peor.m.codigo)}, con ${peor.llevas} de ${peor.lim} (${peor.st.uso} % del límite).` : '';

    pintarCambios(); pintarSimulador(c); pintarHistorial();
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

  function pintarSimulador(c) {
    const cont = $('dias');
    if (!cont.children.length) {
      Object.entries(HORARIO).forEach(([n, d]) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = d.nombre; b.dataset.dia = n;
        b.addEventListener('click', () => { diaSel = n; pintarSimulador(conteo()); });
        cont.appendChild(b);
      });
      const hoy = new Date().getDay();
      diaSel = String(hoy >= 1 && hoy <= 4 ? hoy + 1 : 1);
    }
    [...cont.children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dia === diaSel)));
    const d = HORARIO[diaSel];
    const totalH = Object.values(d.h).reduce((a, b) => a + b, 0);
    const li = Object.entries(d.h).map(([cod, h]) => {
      const llevas = c[cod].inj + c[cod].mano, lim = limiteDe(cod), despues = llevas + h, q = lim - despues;
      return `<li><strong>${corto(cod)}</strong>: +${h} → ${despues} de ${lim}. ${q >= 0 ? `Te quedarían ${q}.` : `<span class="mal">Te pasarías en ${-q}.</span>`}</li>`;
    }).join('');
    const bc = becaCuenta(c), bl = becaLimite();
    $('simulacion').innerHTML = `<strong>Si faltas un ${d.nombre.toLowerCase()} entero sumas ${totalH} faltas:</strong><ul>${li}</ul>
      <p style="margin:.5rem 0 0">Beca MEC: pasarías de ${bc} a ${bc + totalH} de ${bl} horas.</p>`;
  }

  function pintarHistorial() {
    const sel = $('ap-mod');
    if (!sel.children.length) sel.innerHTML = modulos().map(m => `<option value="${m.codigo}">${corto(m.codigo)} · ${esc(m.nombre)}</option>`).join('');
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
        ${d.mano.map(x => `<span class="chip mano">${corto(x.m)}${x.n > 1 ? ' ×' + x.n : ''} (a mano)<button type="button" data-borrar="${esc(x.id)}" aria-label="Borrar esta falta apuntada a mano">×</button></span>`).join('')}
      </div></div>`;
    }).join('') : '<p class="vacio">No hay faltas.</p>';
  }

  // ---------- BECA ----------
  const becaLimite = () => Math.floor(becaHoras() * PCT_BECA / 100);
  function becaCuenta(c) {
    return Object.values(c).reduce((s, k) => s + k.inj + k.mano + (D.ajustes.becaContarJustificadas ? k.just : 0), 0);
  }
  function pintarBeca() {
    const c = conteo(), cuenta = becaCuenta(c), lim = becaLimite(), horas = becaHoras();
    const st = estadoDe(cuenta, lim), quedan = lim - cuenta;
    $('beca-total').className = 'total ' + st.e;
    $('beca-cifra').textContent = `${cuenta} de ${lim} horas`;
    $('beca-texto').textContent = `Para no perder la beca tienes que ir al 80 % de las ${horas} horas del curso: puedes faltar como mucho ${lim} horas (20 %).` +
      (D.ajustes.becaContarJustificadas ? ' Se cuentan injustificadas y justificadas.' : ' Solo se cuentan las injustificadas.');
    $('beca-barra').parentElement.className = 'barra grande ' + st.e;
    $('beca-barra').style.width = Math.min(100, st.uso) + '%';
    $('beca-resumen').innerHTML = `<span class="estado ${st.e}" style="color:var(--${st.e === 'bien' ? 'bien' : st.e === 'aviso' ? 'aviso' : 'peligro'})">${st.e === 'perdida' ? 'Has pasado el 20 %' : st.t}</span>
      <span>${quedan >= 0 ? `Te quedan <strong>${quedan}</strong> horas` : `Te has pasado en <strong>${-quedan}</strong> horas`}</span>
      ${quedan > 0 ? `<span>≈ ${plural(Math.floor(quedan / HORAS_DIA), 'día entero', 'días enteros')} de clase</span>` : ''}
      <span>Has faltado al ${(cuenta / horas * 100).toFixed(1).replace('.', ',')} % del curso</span>`;
    $('beca-just').checked = !!D.ajustes.becaContarJustificadas;
    let ti = 0, tj = 0, tm = 0, tc = 0;
    $('beca-tabla').innerHTML = Object.entries(c).map(([m, k]) => {
      const cu = k.inj + k.mano + (D.ajustes.becaContarJustificadas ? k.just : 0);
      ti += k.inj; tj += k.just; tm += k.mano; tc += cu;
      return `<tr><td>${esc(corto(m))}</td><td>${k.inj}</td><td>${k.just}</td><td>${k.mano}</td><td>${cu}</td></tr>`;
    }).join('') + `<tr><td><strong>Total</strong></td><td><strong>${ti}</strong></td><td><strong>${tj}</strong></td><td><strong>${tm}</strong></td><td><strong>${tc}</strong></td></tr>`;
  }

  // ---------- AJUSTES ----------
  function pintarAjustes() {
    const a = D.ajustes;
    $('cred-estado').textContent = !D.cifradoDisponible ? 'Este ordenador no permite cifrar contraseñas, así que esta opción no está disponible.'
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
      prox = `Próxima lectura: ${cuando}. Se cuenta ${ivTxt} desde la última lectura, aunque cierres la app o apagues el ordenador.`;
    }
    $('aj-proxima').textContent = prox + (D.credUsuario && !D.credFallo ? '' : ' Mientras no guardes tu usuario y contraseña, la app entra en Educamos cada 10 minutos (sin leer las faltas) para que no se cierre la sesión.');
    $('aj-notif').checked = !!a.notificaciones;
    $('aj-ventanas').checked = !!a.mostrarVentanas;
    $('aj-inicio').checked = !!a.iniciarConWindows;
    $('aj-fondo').checked = !!a.segundoPlano;
    if (document.activeElement !== $('aj-beca-horas')) { $('aj-beca-horas').value = a.becaHoras || ''; $('aj-beca-horas').placeholder = String(horasCurso()); }
    $('aj-beca-nota').textContent = `Si lo dejas vacío se usa la suma de las asignaturas (${horasCurso()} h). El Proyecto intermodular se cuenta entero (55 h) aunque se reparte entre 1.º y 2.º; si en secretaría te dan otra cifra de horas del curso, ponla aquí.`;
    if (!$('tabla-horas').contains(document.activeElement)) {
      $('tabla-horas').innerHTML = modulos().map(m => `<tr><td>${corto(m.codigo)}</td><td>${m.semana}</td>
        <td><input type="number" min="1" max="999" value="${horasDe(m.codigo)}" data-horas="${m.codigo}" aria-label="Horas totales de ${m.codigo}"></td><td>${limiteDe(m.codigo)}</td></tr>`).join('');
    }
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
  $('b-logout').addEventListener('click', async () => { await window.app.cerrarSesion(); $('aj-msg').textContent = 'Sesión de Educamos borrada de este ordenador.'; });
  $('form-cred').addEventListener('submit', async ev => {
    ev.preventDefault();
    const r = await window.app.guardarCredenciales($('cred-usuario').value, $('cred-pass').value);
    $('cred-pass').value = '';
    $('aj-msg').textContent = r.ok ? 'Usuario y contraseña guardados (cifrados).' : r.msg;
  });
  $('b-cred-borrar').addEventListener('click', async () => { await window.app.borrarCredenciales(); $('cred-usuario').value = ''; $('cred-pass').value = ''; $('aj-msg').textContent = 'Usuario y contraseña borrados de este ordenador.'; });
  $('b-carpeta').addEventListener('click', () => window.app.abrirCarpeta());
  $('b-abrir-educamos').addEventListener('click', () => { window.app.abrirEducamos(); $('aj-msg').textContent = 'Se ha abierto Educamos. Elige tu centro, cierra la ventana y pulsa «Leer Educamos ahora».'; });
  $('b-registro').addEventListener('click', () => window.app.abrirRegistro());
  $('aj-centro').addEventListener('change', e => { window.app.ajustes({ centro: e.target.value.trim() || 'Brianda de Mendoza' }); $('aj-msg').textContent = 'Centro guardado.'; });
  $('b-borrar-cambios').addEventListener('click', async () => { await window.app.borrarCambios(); $('aj-msg').textContent = 'Lista de cambios borrada.'; });

  const ajuste = (id, clave, conv) => $(id).addEventListener('change', e => { const v = conv(e.target); window.app.ajustes({ [clave]: v }); $('aj-msg').textContent = 'Guardado.'; });
  ajuste('aj-intervalo', 'intervaloMin', t => Number(t.value));
  ajuste('aj-alabrir', 'leerSiempreAlAbrir', t => t.checked);
  ajuste('aj-notif', 'notificaciones', t => t.checked);
  ajuste('aj-ventanas', 'mostrarVentanas', t => t.checked);
  ajuste('aj-inicio', 'iniciarConWindows', t => t.checked);
  ajuste('aj-fondo', 'segundoPlano', t => t.checked);
  ajuste('beca-just', 'becaContarJustificadas', t => t.checked);
  ajuste('aj-beca-horas', 'becaHoras', t => { const v = parseInt(t.value, 10); return v > 0 ? v : null; });
  $('tabla-horas').addEventListener('change', e => {
    const cod = e.target.dataset.horas; if (!cod) return;
    const v = parseInt(e.target.value, 10);
    const horas = Object.assign({}, D.ajustes.horas, { [cod]: v > 0 && v !== oficial(cod) ? v : undefined });
    Object.keys(horas).forEach(k => horas[k] === undefined && delete horas[k]);
    e.target.blur();
    window.app.ajustes({ horas }); $('aj-msg').textContent = 'Guardado.';
  });
  $('b-restaurar').addEventListener('click', () => { window.app.ajustes({ horas: {} }); $('aj-msg').textContent = 'Horas oficiales restauradas.'; });

  $('form-apuntar').addEventListener('submit', ev => {
    ev.preventDefault();
    const f = $('ap-fecha').value, m = $('ap-mod').value, n = Math.max(1, Math.min(6, parseInt($('ap-horas').value, 10) || 1));
    if (!f) return;
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
