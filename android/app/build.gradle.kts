import org.gradle.api.GradleException
import org.gradle.api.tasks.Sync

plugins {
    id("com.android.application")
}

val webRoot = rootProject.projectDir.parentFile
val generatedWebAssets = layout.buildDirectory.dir("generated/webAssets")

// Derived from git history rather than CI's run number so that local builds and
// CI builds agree on a monotonically increasing versionCode - a local build with
// a lower code than what's already installed makes Android refuse to update the
// app in place (INSTALL_FAILED_VERSION_DOWNGRADE), forcing an uninstall first.
val gitCommitCount = try {
    val process = ProcessBuilder("git", "rev-list", "--count", "HEAD")
        .directory(webRoot)
        .redirectErrorStream(true)
        .start()
    val output = process.inputStream.bufferedReader().readText().trim()
    process.waitFor()
    output.toIntOrNull()
} catch (e: Exception) {
    null
} ?: 1

val syncWebAssets by tasks.registering(Sync::class) {
    from(webRoot) {
        include("index.html")
        include("index.js")
        include("changelog.html")
        include("manifest.json")
        include("LICENSE")
        include("NOTICE.md")
        include("THIRD_PARTY_NOTICES.md")
        include("legal/**")
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
        val requiredFiles = listOf(
            "LICENSE",
            "NOTICE.md",
            "THIRD_PARTY_NOTICES.md",
            "legal/APACHE-2.0.txt",
            "node_modules/bootstrap/dist/css/bootstrap.min.css"
        )
        val missingFiles = requiredFiles.filterNot { webRoot.resolve(it).isFile }
        if (missingFiles.isNotEmpty()) {
            throw GradleException(
                "Required Blackbox assets are missing: ${missingFiles.joinToString()}. " +
                    "Run 'yarn install' or 'npm install' in the repository root if a " +
                    "viewer dependency is missing."
            )
        }
    }
}

android {
    namespace = "io.github.mbwallace1390.rotorlens.legacy"
    compileSdk = 36

    defaultConfig {
        applicationId = "io.github.mbwallace1390.rotorlens.legacy"
        minSdk = 24
        targetSdk = 36
        versionCode = gitCommitCount
        versionName = "0.1.$gitCommitCount"
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
