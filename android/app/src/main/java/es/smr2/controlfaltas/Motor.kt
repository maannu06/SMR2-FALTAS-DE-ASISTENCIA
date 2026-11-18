package es.smr2.controlfaltas

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * El «motor» de la app. Tiene dos navegadores ocultos (WebView):
 *  - motor: carga assets/motor/motor.html, que es la misma lógica que la app de Windows (en JavaScript).
 *  - lector: el navegador con el que el motor abre Educamos y la web de FP (no se ve nunca).
 * Esta clase hace de puente: guarda los datos, cifra la contraseña, manda notificaciones
 * y le pasa a la pantalla (MainActivity) lo que tiene que enseñar.
 * Existe una sola vez mientras la app está viva (la usan la pantalla y la tarea de segundo plano).
 */
@SuppressLint("SetJavaScriptEnabled", "StaticFieldLeak")
class Motor private constructor(private val ctx: Context) {

    companion object {
        const val URL_INICIO = "https://educamosclm.castillalamancha.es/s/home"
        const val HOST_SSO = "cerbero.jccm.es"
        const val BASE_FP = "https://educacion.castillalamancha.es"
        // Que Educamos vea un Chrome de ordenador (en la versión de móvil algunos botones cambian)
        const val AGENTE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

        @Volatile private var unico: Motor? = null
        /** Hay que llamarlo desde el hilo principal. */
        fun obtener(ctx: Context): Motor = unico ?: Motor(ctx.applicationContext).also { unico = it }

        /** Prepara un WebView para Educamos (lo usan el lector oculto y la pantalla de inicio de sesión). */
        fun prepararNavegador(w: WebView) {
            w.settings.javaScriptEnabled = true
            w.settings.domStorageEnabled = true
            w.settings.userAgentString = AGENTE
            w.settings.useWideViewPort = true
            w.settings.loadWithOverviewMode = true
            w.settings.setSupportMultipleWindows(true)
            w.settings.javaScriptCanOpenWindowsAutomatically = true
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(w, true)
            // Educamos abre «Seguimiento Educativo» en otra ventana: aquí se abre en el mismo navegador
            w.webChromeClient = object : WebChromeClient() {
                override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
                    val temporal = WebView(view.context)
                    temporal.webViewClient = object : WebViewClient() {
                        private var hecho = false
                        private fun pasar(url: String?) {
                            if (hecho || url.isNullOrBlank() || url == "about:blank") return
                            hecho = true
                            view.loadUrl(url)
                            temporal.post { temporal.destroy() }
                        }
                        override fun shouldOverrideUrlLoading(v: WebView, req: WebResourceRequest): Boolean { pasar(req.url.toString()); return true }
                        override fun onPageStarted(v: WebView, url: String?, favicon: Bitmap?) { pasar(url) }
                    }
                    (resultMsg.obj as WebView.WebViewTransport).webView = temporal
                    resultMsg.sendToTarget()
                    return true
                }
            }
        }
    }

    private val principal = Handler(Looper.getMainLooper())
    private val archivoDatos = File(ctx.filesDir, "datos.json")
    val archivoRegistro = File(ctx.filesDir, "registro.txt")

    private val motor = WebView(ctx)
    private val lector = WebView(ctx)
    private var listo = false
    private val cola = mutableListOf<String>()

    /** Lo que la pantalla tiene que saber (los pone MainActivity mientras está abierta). */
    var alEnviar: ((String) -> Unit)? = null
    var alResponder: ((String, String) -> Unit)? = null
    @Volatile var ocupado = false
        private set
    @Volatile var ultimoPublico: String? = null
        private set

    private var cargaPendiente: Int? = null
    private val finCarga = Runnable { terminarCarga() }

    init {
        // ---- Navegador oculto para Educamos ----
        prepararNavegador(lector)
        // Tamaño de pantalla de ordenador (1280 × 900) aunque no se vea, para que Educamos se dibuje igual que en Windows
        val d = ctx.resources.displayMetrics.density
        val ancho = (1280 * d).toInt(); val alto = (900 * d).toInt()
        lector.measure(View.MeasureSpec.makeMeasureSpec(ancho, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(alto, View.MeasureSpec.EXACTLY))
        lector.layout(0, 0, ancho, alto)
        lector.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) { terminarCarga() }
            override fun onReceivedError(view: WebView, req: WebResourceRequest, error: WebResourceError) {
                if (req.isForMainFrame) terminarCarga()
            }
        }

        // ---- Motor (JavaScript local, servido desde assets) ----
        val cargador = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(ctx)).build()
        motor.settings.javaScriptEnabled = true
        motor.settings.allowFileAccess = false
        motor.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? = cargador.shouldInterceptRequest(req.url)
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest) = true // el motor no navega a ningún sitio
            override fun onPageFinished(view: WebView, url: String?) {
                listo = true
                cola.forEach { motor.evaluateJavascript(it, null) }
                cola.clear()
            }
        }
        motor.addJavascriptInterface(Host(), "AndroidHost")
        motor.addJavascriptInterface(Nav(), "AndroidNav")
        motor.loadUrl("https://appassets.androidplatform.net/assets/motor/motor.html")
    }

    /** Ejecuta JavaScript en el motor (si aún está cargando, espera). Siempre desde el hilo principal. */
    fun js(codigo: String) = principal.post { if (listo) motor.evaluateJavascript(codigo, null) else cola.add(codigo) }

    fun rpc(id: String, metodo: String, argsJson: String) =
        js("Motor.rpc(${JSONObject.quote(id)}, ${JSONObject.quote(metodo)}, ${JSONObject.quote(argsJson)})")

    fun arrancar(abriendoPantalla: Boolean) = js("Motor.arrancar($abriendoPantalla)")
    fun comprobar() = js("Motor.comprobar(); setTimeout(function () { Motor.tocarSesion(); }, 3000);")
    fun trasLogin(ok: Boolean) = rpc("k-login", "trasLogin", "[$ok]")

    // ---------- Navegador oculto ----------
    private fun responder(id: Int, literal: String) = principal.post {
        motor.evaluateJavascript("__nav($id, $literal)", null)
    }

    private fun terminarCarga() {
        val id = cargaPendiente ?: return
        cargaPendiente = null
        principal.removeCallbacks(finCarga)
        responder(id, "true")
    }

    private val plantillaRecorrer: String by lazy { ctx.assets.open("motor/recorrer.js").bufferedReader().use { it.readText() } }

    private inner class Nav {
        @JavascriptInterface
        fun pedir(id: Int, op: String, arg: String) {
            principal.post {
                when (op) {
                    "cargar" -> {
                        cargaPendiente?.let { responder(it, "true") }
                        cargaPendiente = id
                        principal.removeCallbacks(finCarga)
                        principal.postDelayed(finCarga, 40_000)
                        lector.loadUrl(arg)
                    }
                    "url" -> responder(id, JSONObject.quote(lector.url ?: ""))
                    "ejecutar" -> {
                        var contestado = false
                        val limite = Runnable { if (!contestado) { contestado = true; responder(id, "null") } }
                        principal.postDelayed(limite, 6_000) // si la página se está recargando, puede no contestar
                        lector.evaluateJavascript(plantillaRecorrer.replace("__CODIGO__", JSONObject.quote(arg))) { r ->
                            if (!contestado) { contestado = true; principal.removeCallbacks(limite); responder(id, r ?: "null") }
                        }
                    }
                    "borrar" -> {
                        CookieManager.getInstance().removeAllCookies {
                            CookieManager.getInstance().flush()
                            WebStorage.getInstance().deleteAllData()
                            lector.clearCache(true)
                            responder(id, "true")
                        }
                    }
                    else -> responder(id, "null")
                }
            }
        }
    }

    // ---------- Lo que el motor le pide a Android ----------
    private inner class Host {
        @JavascriptInterface
        fun config(): String = JSONObject()
            .put("urlInicio", URL_INICIO).put("hostSSO", HOST_SSO).put("baseFP", BASE_FP)
            .put("version", BuildConfig.VERSION_NAME + " (Android)").toString()

        @JavascriptInterface
        fun leerDatos(): String = try { if (archivoDatos.exists()) archivoDatos.readText() else "" } catch (e: Exception) { "" }

        @JavascriptInterface
        fun guardarDatos(texto: String) {
            synchronized(this@Motor) {
                val tmp = File(ctx.filesDir, "datos.json.tmp")
                tmp.writeText(texto)
                tmp.renameTo(archivoDatos)
            }
            principal.post { CookieManager.getInstance().flush() } // que la sesión de Educamos también quede guardada
        }

        @JavascriptInterface
        fun registrar(msg: String) {
            synchronized(archivoRegistro) {
                try {
                    if (archivoRegistro.exists() && archivoRegistro.length() > 512 * 1024) {
                        archivoRegistro.renameTo(File(ctx.filesDir, "registro.anterior.txt"))
                    }
                    val t = SimpleDateFormat("dd/MM/yyyy, HH:mm:ss", Locale("es", "ES")).format(Date())
                    archivoRegistro.appendText("[$t] $msg\n")
                } catch (e: Exception) { }
            }
        }

        @JavascriptInterface
        fun avisar(titulo: String, texto: String) = Avisos.mostrar(ctx, titulo, texto)

        @JavascriptInterface
        fun enviar(json: String) {
            ultimoPublico = json
            principal.post { alEnviar?.invoke(json) }
        }

        @JavascriptInterface
        fun ocupado(b: Boolean) { ocupado = b }

        @JavascriptInterface
        fun respuesta(id: String, json: String) { principal.post { alResponder?.invoke(id, json) } }

        @JavascriptInterface
        fun cifrar(texto: String): String = Cifrado.cifrar(texto)

        @JavascriptInterface
        fun descifrar(b64: String): String = Cifrado.descifrar(b64)
    }

    /** Las últimas líneas del registro, para compartirlas si algo falla (no tiene faltas ni contraseñas). */
    fun textoRegistro(): String = try {
        val t = if (archivoRegistro.exists()) archivoRegistro.readText() else "Registro vacío."
        if (t.length > 60_000) t.takeLast(60_000) else t
    } catch (e: Exception) { "No se pudo leer el registro." }
}
