package es.smr2.controlfaltas

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/**
 * Tarea de segundo plano que Android lanza cada 15 minutos (aunque la app esté cerrada).
 * Le dice al motor que mire si toca leer Educamos; el motor solo lee si ya ha pasado
 * el tiempo elegido en Ajustes. Si no hay contraseña guardada, «toca» Educamos para que no caduque la sesión.
 */
class LecturaWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val motor = withContext(Dispatchers.Main) { Motor.obtener(applicationContext) }
        motor.comprobar()
        delay(6_000) // tiempo para que el motor arranque y empiece a leer si toca
        val fin = System.currentTimeMillis() + 9 * 60_000 // Android da como mucho 10 minutos a cada tarea
        while (motor.ocupado && System.currentTimeMillis() < fin) delay(2_000)
        return Result.success()
    }
}
