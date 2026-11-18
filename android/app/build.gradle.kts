plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "es.smr2.controlfaltas"
    compileSdk = 35

    defaultConfig {
        applicationId = "es.smr2.controlfaltas"
        minSdk = 26          // Android 8.0 o más nuevo
        targetSdk = 35
        versionCode = 1
        versionName = "1.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Para probar en tu móvil sin crear una clave propia, la versión «release» se firma con la clave de depuración.
            // Si algún día la subes a Google Play, crea tu propia clave (Build → Generate Signed App Bundle / APK).
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    buildFeatures {
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
}
