package es.smr2.controlfaltas

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Cifra la contraseña de Educamos (solo si el usuario la guarda en Ajustes) con una clave del
 * almacén seguro de Android (Android Keystore). La clave no se puede sacar del móvil.
 * Es lo mismo que hace la app de Windows con su cifrado de la cuenta de Windows.
 */
object Cifrado {
    private const val ALIAS = "faltas-smr-credenciales"

    private fun clave(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return gen.generateKey()
    }

    /** Devuelve el texto cifrado (en Base64) o "" si no se puede cifrar. */
    fun cifrar(texto: String): String = try {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, clave())
        val datos = c.doFinal(texto.toByteArray(Charsets.UTF_8))
        Base64.encodeToString(c.iv + datos, Base64.NO_WRAP)
    } catch (e: Exception) { "" }

    /** Devuelve el texto original o "" si no se puede descifrar. */
    fun descifrar(b64: String): String = try {
        val todo = Base64.decode(b64, Base64.NO_WRAP)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, clave(), GCMParameterSpec(128, todo.copyOfRange(0, 12)))
        String(c.doFinal(todo.copyOfRange(12, todo.size)), Charsets.UTF_8)
    } catch (e: Exception) { "" }
}
