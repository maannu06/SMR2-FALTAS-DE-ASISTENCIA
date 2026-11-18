package es.smr2.controlfaltas

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

/**
 * Pantalla principal. Enseña la misma interfaz que la app de Windows (assets/ui) dentro de un WebView.
 * Los botones de la interfaz llaman a «AndroidUI.llamar(...)»; casi todo se le pasa al motor,
 * menos lo que necesita pantallas de Android (iniciar sesión, abrir Educamos, compartir el registro).
 */
class MainActivity : Activity() {

    companion object {
        private const val PEDIR_LOGIN = 1
        private const val PEDIR_LIBRE = 2
        private val FONDOS = mapOf("blanco" to "#FBFCFE", "negro" to "#000000", "azul" to "#141A2A")
    }

    private lateinit var web: WebView
    private lateinit var raiz: FrameLayout
    private lateinit var motor: Motor
    private var idLogin: String? = null
    private var temaActual = ""

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        motor = Motor.obtener(this)

        raiz = FrameLayout(this).apply { fitsSystemWindows = true; setBackgroundColor(Color.parseColor("#141A2A")) }
        web = WebView(this)
        web.setBackgroundColor(Color.TRANSPARENT)
        raiz.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(raiz)

        val cargador = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        web.settings.javaScriptEnabled = true
        web.settings.allowFileAccess = false
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? = cargador.shouldInterceptRequest(req.url)
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                // Los enlaces de la interfaz (por ejemplo, a la web oficial de FP) se abren en el navegador del móvil
                if (req.url.scheme == "https" && req.url.host != "appassets.androidplatform.net") {
                    try { startActivity(Intent(Intent.ACTION_VIEW, req.url)) } catch (e: Exception) { }
                }
                return true
            }
        }
        web.addJavascriptInterface(Puente(), "AndroidUI")

        motor.alEnviar = { json -> mandarDatos(json) }
        motor.alResponder = { id, json -> web.evaluateJavascript("window.__resp && window.__resp(${JSONObject.quote(id)}, $json)", null) }
        web.loadUrl("https://appassets.androidplatform.net/assets/ui/index.html")

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 10)
        }
        // La primera vez (app nueva) lee curso, horario y faltas; después, solo si toca
        if (savedInstanceState == null) motor.arrancar(true)
    }

    private fun mandarDatos(json: String) {
        web.evaluateJavascript("window.__datos && window.__datos($json)", null)
        // El fondo de la barra de arriba sigue al tema elegido
        try {
            val tema = JSONObject(json).optJSONObject("ajustes")?.optString("tema") ?: "azul"
            if (tema != temaActual) {
                temaActual = tema
                raiz.setBackgroundColor(Color.parseColor(FONDOS[tema] ?: FONDOS.getValue("azul")))
                @Suppress("DEPRECATION")
                window.statusBarColor = Color.parseColor(FONDOS[tema] ?: FONDOS.getValue("azul"))
                val claro = tema == "blanco"
                @Suppress("DEPRECATION")
                window.decorView.systemUiVisibility = if (claro) android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR else 0
            }
        } catch (e: Exception) { }
    }

    private inner class Puente {
        @JavascriptInterface
        fun llamar(id: String, metodo: String, argsJson: String) {
            runOnUiThread {
                when (metodo) {
                    "iniciarSesion" -> {
                        idLogin = id
                        startActivityForResult(Intent(this@MainActivity, LoginActivity::class.java).putExtra(LoginActivity.EXTRA_MODO, LoginActivity.MODO_LOGIN), PEDIR_LOGIN)
                    }
                    "abrirEducamos" -> {
                        startActivityForResult(Intent(this@MainActivity, LoginActivity::class.java).putExtra(LoginActivity.EXTRA_MODO, LoginActivity.MODO_LIBRE), PEDIR_LIBRE)
                        responder(id, "true")
                    }
                    "abrirRegistro" -> {
                        val enviar = Intent(Intent.ACTION_SEND).setType("text/plain")
                            .putExtra(Intent.EXTRA_SUBJECT, "Registro de Control de faltas SMR")
                            .putExtra(Intent.EXTRA_TEXT, motor.textoRegistro())
                        startActivity(Intent.createChooser(enviar, "Compartir el registro"))
                        responder(id, "true")
                    }
                    else -> motor.rpc(id, metodo, argsJson)
                }
            }
        }
    }

    private fun responder(id: String, json: String) =
        web.evaluateJavascript("window.__resp && window.__resp(${JSONObject.quote(id)}, $json)", null)

    @Deprecated("Resultado de la pantalla de Educamos")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == PEDIR_LOGIN) {
            val ok = resultCode == RESULT_OK
            idLogin?.let { responder(it, if (ok) "true" else "false") }
            idLogin = null
            motor.trasLogin(ok)
        }
    }

    override fun onResume() {
        super.onResume()
        motor.ultimoPublico?.let { mandarDatos(it) }
    }

    override fun onDestroy() {
        if (motor.alEnviar != null) { motor.alEnviar = null; motor.alResponder = null }
        web.destroy()
        super.onDestroy()
    }
}
