# Task Plan: Production Android APK Build

**Status:** COMPLETE  
**Target:** Standalone Universal Release APK (`.apk`)  
**Package Name:** `org.health.asha.aicopilot`  
**Toolchain:** Expo Prebuild + Android Gradle + Java 17 + Android SDK  
**Signing:** Self-Signed Release Keystore (Direct Sideloading & Installation)  

---

## Tasks

- [x] Task 1: Generate Release Keystore (`asha-release.keystore`) using Java 17 `keytool`.
- [x] Task 2: Configure `eas.json` and Android build parameters for standalone APK.
- [x] Task 3: Execute `npx expo prebuild --platform android --clean` in `apps/mobile`.
- [x] Task 4: Configure `signingConfigs.release` and build configuration in `apps/mobile/android/app/build.gradle`.
- [x] Task 5: Run Gradle release build (`./gradlew assembleRelease`) in `apps/mobile/android`.
- [x] Task 6: Verify generated release APK artifact, size, and readiness for installation.
  - **Version Discipline (ISS-310):** Every CI build MUST bump `versionCode` using `$env:BUILD_NUMBER` or `$env:VERSION_CODE` (e.g. GitHub Actions `github.run_number`). Never ship repeated `versionCode 1` on production release tracks.
