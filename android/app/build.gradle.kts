import org.gradle.api.GradleException
import org.gradle.api.tasks.Sync

plugins {
    id("com.android.application")
}

val webRoot = rootProject.projectDir.parentFile
val generatedWebAssets = layout.buildDirectory.dir("generated/webAssets")
val ciRunNumber = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1

val syncWebAssets by tasks.registering(Sync::class) {
    from(webRoot) {
        include("index.html")
        include("index.js")
        include("changelog.html")
        include("manifest.json")
        include("css/**")
        include("images/**")
        include("js/**")
        include("locales/**")
        include("_locales/**")
        include("resources/**")
        include("node_modules/bootstrap/**")
        include("node_modules/html2canvas/**")
        include("node_modules/lodash/**")
        include("node_modules/webm-writer/**")
        exclude("android/**")
    }

    into(generatedWebAssets)

    doFirst {
        val bootstrapCss = webRoot.resolve("node_modules/bootstrap/dist/css/bootstrap.min.css")
        if (!bootstrapCss.isFile) {
            throw GradleException(
                "Blackbox web dependencies are missing. Run 'yarn install' or 'npm install' " +
                    "in the repository root before building Android."
            )
        }
    }
}

android {
    namespace = "org.rotorflight.blackbox"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.rotorflight.blackbox"
        minSdk = 24
        targetSdk = 36
        versionCode = ciRunNumber
        versionName = "0.1.$ciRunNumber"
    }

    buildFeatures {
        buildConfig = true
    }

    sourceSets {
        getByName("main") {
            // AGP 9 does not accept Provider instances in the legacy SourceSet API.
            // preBuild still depends on syncWebAssets below, so resolving this path
            // during configuration is safe and keeps the task ordering explicit.
            assets.srcDir(generatedWebAssets.get().asFile)
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

tasks.named("preBuild").configure {
    dependsOn(syncWebAssets)
}

dependencies {
    implementation("androidx.webkit:webkit:1.16.0")
}
