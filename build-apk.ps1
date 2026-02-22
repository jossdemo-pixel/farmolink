param(
    [ValidateSet("debug", "release")]
    [string]$Type = "debug"
)

$ErrorActionPreference = "Stop"

Write-Host "Starting FarmoLink APK build..." -ForegroundColor Green
Write-Host "Build type: $Type" -ForegroundColor Cyan

Write-Host ""
Write-Host "1) Building web app..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Web build failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "2) Syncing Capacitor Android..." -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) {
    Write-Host "Capacitor sync failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "3) Building APK with Gradle..." -ForegroundColor Yellow
Push-Location android
try {
    if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
        $fallbackJdk = "C:\Program Files\Microsoft\jdk-17.0.17.10-hotspot"
        if (Test-Path "$fallbackJdk\bin\java.exe") {
            $env:JAVA_HOME = $fallbackJdk
            Write-Host "JAVA_HOME set to: $env:JAVA_HOME" -ForegroundColor DarkYellow
        }
    }

    if ($Type -eq "release") {
        .\gradlew.bat assembleRelease
        $apkPath = "app\build\outputs\apk\release\app-release.apk"
    } else {
        .\gradlew.bat assembleDebug
        $apkPath = "app\build\outputs\apk\debug\app-debug.apk"
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Gradle build failed." -ForegroundColor Red
        exit 1
    }

    if (Test-Path $apkPath) {
        $apk = Get-Item $apkPath
        $sizeMb = [Math]::Round($apk.Length / 1MB, 2)
        Write-Host ""
        Write-Host "APK created successfully." -ForegroundColor Green
        Write-Host "Path: $($apk.FullName)" -ForegroundColor Cyan
        Write-Host "Size: $sizeMb MB" -ForegroundColor Cyan
        Write-Host "Install command: adb install -r `"$($apk.FullName)`"" -ForegroundColor Yellow
    } else {
        Write-Host "APK file not found after build." -ForegroundColor Red
        exit 1
    }
}
finally {
    Pop-Location
}

