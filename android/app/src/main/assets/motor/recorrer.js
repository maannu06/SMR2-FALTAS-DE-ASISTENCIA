(function () {
  // Ejecuta un trozo de JavaScript en la página y en todos sus marcos (frames) del mismo sitio.
  // Devuelve el primer resultado "verdadero" o null. Android pone el código en la marca de abajo (como texto JSON).
  var codigo = __CODIGO__;
  var res = null;
  function rec(w) {
    if (res !== null) return;
    try { var r = w.eval(codigo); if (r) { res = r; return; } } catch (e) {}
    var n = 0;
    try { n = w.frames.length; } catch (e) {}
    for (var i = 0; i < n && res === null; i++) { try { rec(w.frames[i]); } catch (e) {} }
  }
  rec(window);
  return res;
})()
