plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val build = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "gt.calin.sueno"
    compileSdk = 34

    defaultConfig {
        applicationId = "gt.calin.sueno"
        minSdk = 29
        targetSdk = 34
        versionCode = build
        versionName = "1.0.$build"
    }

    signingConfigs {
        create("sueno") {
            storeFile = file("sueno.keystore")
            storePassword = "suenobonito"
            keyAlias = "sueno"
            keyPassword = "suenobonito"
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("sueno")
        }
        getByName("debug") {
            signingConfig = signingConfigs.getByName("sueno")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}
