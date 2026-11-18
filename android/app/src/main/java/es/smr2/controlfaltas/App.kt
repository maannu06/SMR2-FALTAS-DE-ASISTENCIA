package es.smr2.controlfaltas

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Arranque de la app: crea el canal de notificaciones y programa la tarea que,
 * cada 15 minutos (lo mínimo que deja Android), mira si toca leer Educamos.
 * La tarea solo lee si ya ha pasado el tiempo elegido en Ajustes (eso lo decide el motor).
 */
class App : Application() {
    override fun onCreate() {
        super.onCreate()
        val canal = NotificationChannel(Avisos.CANAL, getString(R.string.canal_avisos), NotificationManager.IMPORTANCE_DEFAULT)
        canal.description = getString(R.string.canal_avisos_desc)
        getSystemService(NotificationManager::class.java).createNotificationChannel(canal)

        val tarea = PeriodicWorkRequestBuilder<LecturaWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork("lectura-faltas", ExistingPeriodicWorkPolicy.KEEP, tarea)
    }
}
