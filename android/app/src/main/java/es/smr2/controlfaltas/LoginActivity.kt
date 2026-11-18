package es.smr2.controlfaltas

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Pantalla con Educamos de verdad, para que el alumno inicie sesión él mismo (con su usuario o con Cl@ve).
 * La app nunca ve la contraseña: solo se queda la sesión (cookies), igual que en un navegador.
 *  - modo «login»: se cierra sola en cuanto detecta que ya estás dentro de Educamos.
 *  - modo «libre»: no se cierra sola (sirve para elegir el centro a mano). Se sale con «Volver a la app».
 */
class LoginActivity : Activity() {

    companion object {
        const val EXTRA_MODO = "modo"
        const val MODO_LOGIN = "login"
        const val MODO_LIBRE = "libre"
        private const val JS_DENTRO = "(() => !![...document.querySelectorAll('button,[role=button],a')].find(e => /panel de aplicaciones|cuenta de educamos/i.test((e.getAttribute('aria-label')||'') + ' ' + (e.title||''))))()"
    }

    private lateinit var web: WebView
    private val reloj = Handler(Looper.getMainLooper())
    private var terminado = false
    private val hostEducamos = Uri.parse(Motor.URL_INICIO).host

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val modo = intent.getStringExtra(EXTRA_MODO) ?: MODO_LOGIN

        val raiz = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; fitsSystemWindows = true; setBackgroundColor(Color.parseColor("#141A2A")) }
        val barra = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(24, 12, 12, 12) }
        val texto = TextView(this).apply {
            setTextColor(Color.WHITE)
            text = if (modo == MODO_LOGIN) "Entra en Educamos. Esta pantalla se cerrará sola al entrar." else "Educamos con la sesión de la app"
            layoutParams = LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f)
        }
        val volver = Button(this).apply { text = "Volver a la app"; setOnClickListener { fin(false) } }
        barra.addView(texto); barra.addView(volver)
        web = WebView(this)
        Motor.prepararNavegador(web)
        web.settings.builtInZoomControls = true
        web.settings.displayZoomControls = false
        web.webViewClient = WebViewClient()
        raiz.addView(barra, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        raiz.addView(web, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
        setContentView(raiz)
        web.loadUrl(Motor.URL_INICIO)

        if (modo == MODO_LOGIN) reloj.postDelayed(object : Runnable {
            override fun run() {
                if (terminado) return
                if (Uri.parse(web.url ?: "").host == hostEducamos) {
                    web.evaluateJavascript(JS_DENTRO) { r ->
                        if (r == "true") reloj.postDelayed({ fin(true) }, 1500) // deja que Educamos termine de guardar la sesión
                    }
                }
                reloj.postDelayed(this, 1500)
            }
        }, 1500)
    }

    private fun fin(ok: Boolean) {
        if (terminado) return
        terminado = true
        CookieManager.getInstance().flush()
        setResult(if (ok) RESULT_OK else RESULT_CANCELED)
        finish()
    }

    @Deprecated("Atrás: si se puede, vuelve a la página anterior de Educamos")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else fin(false)
    }

    override fun onDestroy() {
        reloj.removeCallbacksAndMessages(null)
        web.destroy()
        super.onDestroy()
    }
}
