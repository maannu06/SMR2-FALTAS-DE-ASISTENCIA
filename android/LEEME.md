# Control de faltas SMR · Android

Versión para móvil de la app de Windows «Control de faltas SMR» (2.º SMR · IES Brianda de Mendoza).
Hace lo mismo que la de Windows: lee tus faltas de EducamosCLM, calcula el límite del 25 % de cada asignatura
(evaluación continua) y del 20 % del curso (beca MEC), detecta faltas nuevas, justificadas y quitadas, y te avisa.

## Abrirla con Android Studio (paso a paso)

1. Instala [Android Studio](https://developer.android.com/studio) (la versión normal, con las opciones por defecto).
2. Abre Android Studio → **Open** → elige esta carpeta (la que tiene `settings.gradle.kts`).
3. Espera a que abajo termine **Gradle sync** (la primera vez descarga cosas y tarda unos minutos).
   Si te pregunta si confías en el proyecto, pulsa **Trust Project**.
4. Conecta tu móvil por USB con la **depuración USB** activada
   (Ajustes → Información del teléfono → pulsa 7 veces «Número de compilación» → vuelve a Ajustes → Opciones de desarrollador → Depuración USB).
   También puedes usar un móvil virtual: **Device Manager → Create Device**.
5. Arriba elige tu móvil y pulsa el triángulo verde **Run ‘app’**. La app se instala y se abre.

Para sacar un `.apk` y pasarlo a otro móvil: **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
Lo deja en `app/build/outputs/apk/debug/app-debug.apk`.

## La primera vez que la abres

1. Android te pregunta si la app puede enviarte notificaciones: pulsa **Permitir** (si no, no te avisará de faltas nuevas).
2. Pulsa **Iniciar sesión en Educamos** y entra con tu usuario o con Cl@ve. La pantalla se cierra sola al entrar.
3. La primera lectura tarda un poco más: lee tu curso y tu horario de Educamos y busca en la web oficial de FP
   de la Junta las horas de cada asignatura. Lo guarda y después solo lee las faltas.

## Cómo está hecha

- `app/src/main/assets/ui/`: la pantalla. Es **la misma que la de Windows** (`src/ui`), copiada y adaptada con
  `herramientas/adaptar-ui.py` (quita las opciones de Windows y cambia «ordenador» por «móvil»).
  `puente.js` conecta los botones con Android.
- `app/src/main/assets/motor/`: el motor, en JavaScript, igual que en Windows:
  - `logica.js`: copia exacta de `src/logica.js` (cálculos, horario, «Día completo», cambios).
  - `lector.js`: el lector de Educamos y de la web de FP (`src/educamos.js` + `src/web.js`), usando un navegador oculto.
  - `motor.js`: datos, cuándo leer, avisos (la parte de `src/main.js`).
  - `recorrer.js`: ejecuta el código del lector en todos los marcos (frames) de la página de Educamos.
- `app/src/main/java/es/smr2/controlfaltas/`: la parte de Android (Kotlin):
  - `Motor.kt`: los dos navegadores ocultos (motor y lector) y el puente con el motor.
  - `MainActivity.kt`: la pantalla principal. `LoginActivity.kt`: Educamos visible para iniciar sesión.
  - `LecturaWorker.kt`: tarea de segundo plano. Android la lanza cada 15 minutos (lo mínimo que permite),
    y el motor solo lee Educamos si ya ha pasado el tiempo elegido en Ajustes.
  - `Cifrado.kt`: si guardas tu contraseña, se cifra con el almacén seguro de Android (Android Keystore).
  - `Avisos.kt`: notificaciones.

## Diferencias con la de Windows

- No hay icono junto al reloj ni «abrir al encender»: Android lanza la tarea de segundo plano solo.
- Algunos móviles (Xiaomi, Huawei, Samsung con ahorro de batería fuerte) paran las tareas de segundo plano.
  Si no te llegan los avisos, en los ajustes de batería del móvil pon esta app **sin restricciones**.
- «Abrir el registro» es «Compartir el registro»: lo puedes mandar por WhatsApp o correo si algo falla
  (no tiene tus faltas ni tu contraseña).

## Tus datos

Todo se queda en el móvil (carpeta privada de la app). Solo se conecta a Educamos
(`educamosclm.castillalamancha.es`, `cerbero.jccm.es`, `papassegedu.jccm.es`) y a la web de FP de la Junta
(`educacion.castillalamancha.es`). Al desinstalar la app se borra todo.
