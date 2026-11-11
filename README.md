# SMR2º FALTAS DE ASISTENCIA

App de Windows 11 para que el alumnado de **2.º de SMR del IES Brianda de Mendoza** (Guadalajara) controle sus faltas de asistencia. Lee tus faltas de **EducamosCLM** sola y te avisa antes de que pierdas la evaluación continua o la beca MEC.

> App hecha por alumnos. **No es oficial** de la Junta ni del instituto. Comprueba siempre tus faltas en Educamos y pregunta a tu tutor si tienes dudas.

## Qué hace

- **Faltas**: cuántas faltas injustificadas llevas en cada asignatura y cuántas te quedan antes de perder la evaluación continua (25 %).
- **Beca MEC**: cuántas horas llevas sobre el 20 % del curso que puedes faltar sin perder la beca.
- **Cambios**: te avisa con una notificación de Windows cuando hay una falta nueva, cuando te justifican una o cuando la quitan de Educamos.
- **¿Y si falto?**: eliges un día de la semana y te dice cuántas faltas sumarías en cada asignatura.
- **Historial** de todas tus faltas, y puedes apuntar a mano las que aún no han salido en Educamos.
- Funciona en segundo plano junto al reloj y se abre sola al encender el ordenador.
- Lee Educamos cada cierto tiempo (de 30 minutos a 24 horas, lo eliges tú). El tiempo se cuenta desde la última lectura, aunque cierres la app o apagues el ordenador.

## Cómo instalarla

1. Ve a **[Releases](../../releases)** y descarga `ControlFaltasSMR-portable.exe`.
2. Guárdalo en una carpeta fija (por ejemplo, Documentos) y haz doble clic.
3. Windows puede decir «Windows protegió su PC» porque el programa no tiene firma digital. Pulsa **Más información → Ejecutar de todas formas**.
4. Pulsa **«Iniciar sesión en Educamos»** y entra con tu usuario o con Cl@ve. La ventana se cierra sola al entrar.

### Para no tener que volver a entrar (opcional)

Educamos cierra la sesión si pasa un rato sin usarse y siempre que apagas el ordenador. Mientras el ordenador está encendido, la app entra cada 10 minutos para mantener la sesión viva. Si quieres que entre sola también después de apagarlo, en **Ajustes** puedes guardar tu usuario y contraseña de Educamos:

- Se guardan **cifrados con tu cuenta de Windows** (DPAPI), solo en tu ordenador.
- Solo se usan para rellenar la pantalla de entrada de Educamos.
- Si fallan una vez, la app deja de usarlos para que Educamos no bloquee tu cuenta.
- Con Cl@ve no funciona.

## Tus datos

Todo se queda **en tu ordenador**, en `%APPDATA%\Control de faltas SMR\`. La app no envía tus datos a ningún sitio: solo se conecta a Educamos (`educamosclm.castillalamancha.es`, `cerbero.jccm.es` y `papassegedu.jccm.es`).

## Las normas que usa

| | Límite | Faltas que cuentan | Norma |
|---|---|---|---|
| Evaluación continua | Faltar como mucho el **25 %** de las horas de **cada módulo** | Solo las injustificadas | Orden 201/2024 de Castilla-La Mancha, art. 3 |
| Beca MEC | Asistir al menos al **80 %** de las horas lectivas (faltar como mucho el **20 %** del curso) | Por defecto, injustificadas **y** justificadas (la norma no excluye las justificadas; se puede cambiar) | Convocatoria de becas generales 2026-2027, art. 43.2 |

Horas de cada módulo (tabla oficial de la Junta para SMR):

| Módulo | Horas | h/semana | Máximo de faltas (25 %) |
|---|---|---|---|
| Aplicaciones ofimáticas (APOF) | 270 | 7 | 67 |
| Sistemas operativos en red (SRED) | 223 | 6 | 55 |
| Servicios en red (SR) | 205 | 5 | 51 |
| Seguridad informática (SEIN) | 167 | 4 | 41 |
| Introducción a la programación, optativa (IALP) | 80 | 4 | 20 |
| Itinerario personal para la empleabilidad II (IPEII) | 60 | 3 | 15 |
| Proyecto intermodular (PIMSM) | 55 | 1 | 13 |

Las horas se pueden cambiar en **Ajustes** si un profesor os da otra cifra.

## Importante: el horario

Cuando una falta justificada sale en Educamos como **«Día completo»**, la app la reparte en las horas de cada asignatura según el horario del curso 2026-27 que lleva dentro. Si tu grupo tiene otro horario, cambia el objeto `HORARIO` en `src/logica.js` y en `src/ui/app.js` (las horas de cada asignatura por día, de lunes a viernes) y compila tu propia versión.

## Compilarla tú

Necesitas [Node.js LTS](https://nodejs.org/).

```bash
npm install
npm start        # abre la app
npm run dist     # crea dist/ControlFaltasSMR-portable.exe
```

Archivos:

- `src/main.js`: ventana, icono junto al reloj, lectura automática, sesión y avisos.
- `src/educamos.js`: entra en Educamos con ventanas ocultas y lee la tabla de faltas.
- `src/logica.js`: asignaturas, horario, «Día completo» y comparación de cambios.
- `src/ui/`: la interfaz (HTML, CSS y JS).

## Si algo falla

- En **Ajustes**, marca «Enseñar las ventanas de Educamos mientras lee» y pulsa «Leer Educamos ahora» para ver en qué paso se queda.
- Si Educamos cambia su web, el lector puede dejar de funcionar. Abre una *issue* con una captura.

## Licencia

MIT. Mira el archivo [LICENSE](LICENSE).
