#!/usr/bin/env python3
"""Copia la interfaz de la app de Windows (src/ui) a Android y cambia lo que es propio de Windows.
Uso: python3 herramientas/adaptar-ui.py RUTA/AL/src/ui
Así las dos apps tienen la misma pantalla y solo hay que mantenerla en un sitio."""
import sys, os, shutil
origen = sys.argv[1]
destino = os.path.join(os.path.dirname(__file__), '..', 'app', 'src', 'main', 'assets', 'ui')
os.makedirs(destino, exist_ok=True)

def cambiar(texto, cambios, archivo):
    for viejo, nuevo in cambios:
        if viejo not in texto:
            sys.exit(f'No encuentro en {archivo}: {viejo[:70]!r}  (¿ha cambiado la interfaz de Windows?)')
        texto = texto.replace(viejo, nuevo)
    return texto

html = open(os.path.join(origen, 'index.html'), encoding='utf-8').read()
html = cambiar(html, [
    ('<html lang="es" data-tema="azul">', '<html lang="es" data-tema="azul" class="android">'),
    ('<meta name="viewport" content="width=device-width, initial-scale=1">', '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'),
    ('<script src="app.js"></script>', '<script src="puente.js"></script>\n<script src="app.js"></script>'),
    ('entra con tu usuario o con Cl@ve en la ventana que se abre y se cerrará sola. La app nunca ve tu contraseña: solo guarda la sesión en este ordenador, igual que un navegador.',
     'entra con tu usuario o con Cl@ve en la pantalla que se abre; se cerrará sola. La app nunca ve tu contraseña: solo guarda la sesión en este móvil, igual que un navegador.'),
    ('Educamos cierra la sesión si pasa un rato sin usarse y siempre al apagar el ordenador. La app la mantiene abierta mientras está encendida, pero si quieres que no tengas que volver a entrar nunca, guarda aquí tu usuario y contraseña de Educamos. Se guardan <strong>cifrados con tu cuenta de Windows</strong> en este ordenador y solo se usan para entrar en Educamos.',
     'Educamos cierra la sesión si pasa un rato sin usarse. La app intenta mantenerla abierta, pero si quieres no tener que volver a entrar, guarda aquí tu usuario y contraseña de Educamos. Se guardan <strong>cifrados con el almacén seguro de Android</strong> en este móvil y solo se usan para entrar en Educamos.'),
    ('Avisarme con una notificación de Windows cuando haya cambios', 'Avisarme con una notificación cuando haya cambios'),
    ('<label class="check"><input type="checkbox" id="aj-ventanas">', '<label class="check solo-windows"><input type="checkbox" id="aj-ventanas">'),
    ('<h2>Windows</h2>', '<h2 class="solo-windows">Windows</h2>'),
    ('<label class="check"><input type="checkbox" id="aj-inicio">', '<label class="check solo-windows"><input type="checkbox" id="aj-inicio">'),
    ('<label class="check"><input type="checkbox" id="aj-fondo">', '<label class="check solo-windows"><input type="checkbox" id="aj-fondo">'),
    ('<button type="button" class="boton" id="b-carpeta">', '<button type="button" class="boton solo-windows" id="b-carpeta">'),
    ('Abrir el registro (para ver dónde falla)', 'Compartir el registro (para ver dónde falla)'),
], 'index.html')
open(os.path.join(destino, 'index.html'), 'w', encoding='utf-8').write(html)

js = open(os.path.join(origen, 'app.js'), encoding='utf-8').read()
js = cambiar(js, [
    ('Sesión de Educamos guardada en este ordenador.', 'Sesión de Educamos guardada en este móvil.'),
    ('Este ordenador no permite cifrar contraseñas', 'Este móvil no permite cifrar contraseñas'),
    ('aunque cierres la app o apagues el ordenador.', 'aunque cierres la app o apagues el móvil (si el móvil está apagado, lee en cuanto se encienda).'),
    ('la app entra en Educamos cada 10 minutos', 'la app entra en Educamos cada 15 minutos más o menos'),
    ("'Sesión de Educamos borrada de este ordenador.'", "'Sesión de Educamos borrada de este móvil.'"),
    ("'Usuario y contraseña borrados de este ordenador.'", "'Usuario y contraseña borrados de este móvil.'"),
    ("'Se ha abierto Educamos. Elige tu centro, cierra la ventana y pulsa «Leer Educamos ahora».'", "'Se ha abierto Educamos. Elige tu centro, vuelve atrás y pulsa «Leer Educamos ahora».'"),
], 'app.js')
if 'ordenador' in js:
    print('Aviso: app.js aún dice «ordenador» en:', [l.strip()[:80] for l in js.splitlines() if 'ordenador' in l])
open(os.path.join(destino, 'app.js'), 'w', encoding='utf-8').write(js)

css = open(os.path.join(origen, 'style.css'), encoding='utf-8').read()
css += '''
/* ---- Solo Android ---- */
.android .solo-windows { display: none !important; }
.android body { -webkit-tap-highlight-color: transparent; }
@media (max-width: 600px) {
  .android .cabecera { flex-direction: column; align-items: flex-start; gap: .5rem; }
  .android .sync { flex-wrap: wrap; }
  .android .campos { flex-direction: column; align-items: stretch; }
  .android table { font-size: .85rem; width: 100%; }
  .android th, .android td { padding: .45rem .3rem; white-space: normal; }
  .android th { line-height: 1.2; }
}
'''
open(os.path.join(destino, 'style.css'), 'w', encoding='utf-8').write(css)
print('Interfaz copiada y adaptada en', os.path.normpath(destino))
