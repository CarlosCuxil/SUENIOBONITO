import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val build = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
// Firma para Play Store: solo si se pide con -PplaySign y existe la llave privada
val playSign = project.hasProperty("playSign") && file("upload.jks").exists()

android {
    namespace = "gt.calin.sueno"
    compileSdk = 36

    defaultConfig {
        applicationId = "gt.calin.sueno"
        minSdk = 29
        targetSdk = 36
        versionCode = build + 100
        versionName = "1.1.$build"
    }

    signingConfigs {
        create("sueno") {
            storeFile = file("sueno.keystore")
            storePassword = "suenobonito"
            keyAlias = "sueno"
            keyPassword = "suenobonito"
        }
        create("upload") {
            storeFile = file("upload.jks")
            storePassword = System.getenv("UPLOAD_STORE_PASSWORD") ?: ""
            keyAlias = System.getenv("UPLOAD_KEY_ALIAS") ?: "upload"
            keyPassword = System.getenv("UPLOAD_KEY_PASSWORD") ?: ""
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName(if (playSign) "upload" else "sueno")
        }
        getByName("debug") {
            signingConfig = signingConfigs.getByName("sueno")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}
