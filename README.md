# SMR2º FALTAS DE ASISTENCIA

App de Windows 11 para que el alumnado de **2.º de SMR del IES Brianda de Mendoza** (Guadalajara) controle sus faltas de asistencia. Lee tus faltas de **EducamosCLM** sola y te avisa antes de que pierdas la evaluación continua o la beca MEC.

> App hecha por alumnos. **No es oficial** de la Junta ni del instituto. Comprueba siempre tus faltas en Educamos y pregunta a tu tutor si tienes dudas.

## Qué hace

- **Faltas**: cuántas faltas injustificadas llevas en cada asignatura y cuántas te quedan antes de perder la evaluación continua (25 %).
- **Beca MEC**: cuántas horas llevas sobre el 20 % del curso que puedes faltar sin perder la beca.
- **Cambios**: te avisa con una notificación de Windows cuando hay una falta nueva, cuando te justifican una o cuando la quitan de Educamos.
- **Trimestre**: te dice en qué trimestre estás y cuántas faltas injustificadas llevas en él.
- **Tu curso, solo**: la primera vez que la usas, lee de Educamos tu curso y tu horario, y busca en la web oficial de FP de la Junta las horas de cada asignatura. No hay que escribir nada a mano.
- **Temas**: blanco, negro o azul oscuro (en **Ajustes**).
- **Historial** de todas tus faltas, y puedes apuntar a mano las que aún no han salido en Educamos.
- Funciona en segundo plano junto al reloj y se abre sola al encender el ordenador.
- Lee Educamos cada cierto tiempo (de 30 minutos a 24 horas, lo eliges tú). El tiempo se cuenta desde la última lectura, aunque cierres la app o apagues el ordenador.

## Cómo instalarla

1. Ve a **[Releases](../../releases)** y descarga `ControlFaltasSMR-portable.exe`.
2. Guárdalo en una carpeta fija (por ejemplo, Documentos) y haz doble clic.
3. Windows puede decir «Windows protegió su PC» porque el programa no tiene firma digital. Pulsa **Más información → Ejecutar de todas formas**.
4. Pulsa **«Iniciar sesión en Educamos»** y entra con tu usuario o con Cl@ve. La ventana se cierra sola al entrar.
5. La primera lectura tarda un poco más: además de tus faltas, lee tu curso, tu horario y las horas oficiales. Después solo lee las faltas.

### Para no tener que volver a entrar (opcional)

Educamos cierra la sesión si pasa un rato sin usarse y siempre que apagas el ordenador. Mientras el ordenador está encendido, la app entra cada 10 minutos para mantener la sesión viva. Si quieres que entre sola también después de apagarlo, en **Ajustes** puedes guardar tu usuario y contraseña de Educamos:

- Se guardan **cifrados con tu cuenta de Windows** (DPAPI), solo en tu ordenador.
- Solo se usan para rellenar la pantalla de entrada de Educamos.
- Si fallan una vez, la app deja de usarlos para que Educamos no bloquee tu cuenta.
- Con Cl@ve no funciona.

## Si tienes más de un centro en Educamos

Si también estás matriculado en otro centro (por ejemplo, la Escuela Oficial de Idiomas), la app comprueba antes de leer en qué centro está Educamos y, si no es el IES Brianda de Mendoza, lo cambia sola. Si no puede, **no guarda nada** y te avisa; entonces, en **Ajustes**, pulsa «Abrir Educamos para cambiar el centro», elige tu centro y vuelve a leer. Si las faltas leídas no son de asignaturas de 2.º SMR, tampoco las guarda. El centro se puede cambiar en **Ajustes → Centro**.

## Tus datos

Todo se queda **en tu ordenador**, en `%APPDATA%\Control de faltas SMR\`. La app no envía tus datos a ningún sitio: solo se conecta a Educamos (`educamosclm.castillalamancha.es`, `cerbero.jccm.es` y `papassegedu.jccm.es`) y, para buscar las horas de tu ciclo, a la web de FP de la Junta (`educacion.castillalamancha.es`), donde solo busca el nombre del ciclo.

## Las normas que usa

| | Límite | Faltas que cuentan | Norma |
|---|---|---|---|
| Evaluación continua | Faltar como mucho el **25 %** de las horas de **cada módulo** | Solo las injustificadas | Orden 201/2024 de Castilla-La Mancha, art. 3 |
| Beca MEC | Asistir al menos al **80 %** de las horas lectivas (faltar como mucho el **20 %** del curso) | Las injustificadas (y las que apuntes a mano) | Convocatoria de becas generales 2026-2027, art. 43.2 |

## Horas de cada asignatura y horario

La app no lleva las horas escritas a mano. La **primera vez** que lee Educamos:

1. Lee tu **curso** (por ejemplo, «2º de CFGM (LOFP) - Sistemas Microinformáticos y Redes») y tu **horario** (Seguimiento Educativo → Horario).
2. Busca tu ciclo en la web oficial [¿Qué estudiar? de FP de Castilla-La Mancha](https://educacion.castillalamancha.es/fp/que-estudiar) y lee la tabla «Horas totales» de cada módulo. La optativa sale allí como «Optatividad».
3. Lo guarda y no se puede cambiar a mano. Si cambias de curso o de horario, en **Ajustes → Tu curso** pulsa «Volver a leer curso y horario».

Con el horario, las faltas justificadas que salen como **«Día completo»** se reparten en las horas de cada asignatura de ese día. Si la web oficial no responde, la app usa una copia de la tabla de 2.º SMR que lleva dentro y lo vuelve a intentar en la siguiente lectura.

Ejemplo (2.º SMR, curso 2026-27): Aplicaciones ofimáticas 270 h (máximo 67 faltas), Sistemas operativos en red 223 h (55), Servicios en red 205 h (51), Seguridad informática 167 h (41), optativa 80 h (20), Itinerario personal para la empleabilidad II 60 h (15), Proyecto intermodular 55 h (13).

## Compilarla tú

Necesitas [Node.js LTS](https://nodejs.org/).

```bash
npm install
npm start        # abre la app
npm run dist     # crea dist/ControlFaltasSMR-portable.exe
```

Archivos:

- `src/main.js`: ventana, icono junto al reloj, lectura automática, sesión y avisos.
- `src/educamos.js`: entra en Educamos con ventanas ocultas y lee tu curso, tu horario y la tabla de faltas.
- `src/web.js`: busca las horas oficiales de tu ciclo en la web de FP de la Junta.
- `src/logica.js`: curso, horario, horas de cada asignatura, «Día completo» y comparación de cambios.
- `src/ui/`: la interfaz (HTML, CSS y JS).

## Si algo falla

- En **Ajustes**, marca «Enseñar las ventanas de Educamos mientras lee» y pulsa «Leer Educamos ahora» para ver en qué paso se queda.
- En **Ajustes**, «Abrir el registro» enseña cada paso de la lectura y dónde se para. No guarda faltas ni contraseñas: puedes adjuntarlo en una *issue*.
- Si Educamos cambia su web, el lector puede dejar de funcionar. Abre una *issue* con una captura y el registro.

## Licencia

MIT. Mira el archivo [LICENSE](LICENSE).
