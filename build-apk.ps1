# build-apk.ps1 - Script para compilar APK do FarmoLink (Windows)
# Uso: .\build-apk.ps1 -Type debug
# Ou:  .\build-apk.ps1 -Type release

param(
    [ValidateSet("debug", "release")]
    [string]$Type = "debug"
)

Write-Host "🚀 Iniciando compilação do APK FarmoLink..." -ForegroundColor Green
Write-Host "📦 Tipo de build: $Type" -ForegroundColor Cyan

# Step 1: Build da Web
Write-Host ""
Write-Host "1️⃣ Compilando aplicação web..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erro na compilação web!" -ForegroundColor Red
    exit 1
}

# Step 2: Sync com Android
Write-Host ""
Write-Host "2️⃣ Sincronizando com Android..." -ForegroundColor Yellow
npx cap sync android

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erro ao sincronizar!" -ForegroundColor Red
    exit 1
}

# Step 3: Compilar APK
Write-Host ""
Write-Host "3️⃣ Compilando APK ($Type)..." -ForegroundColor Yellow
Set-Location android

if ($Type -eq "release") {
    .\gradlew.bat assembleRelease
    $APK_PATH = "app\build\outputs\apk\release\app-release.apk"
} else {
    .\gradlew.bat assembleDebug
    $APK_PATH = "app\build\outputs\apk\debug\app-debug.apk"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erro na compilação do Gradle!" -ForegroundColor Red
    Set-Location ..
    exit 1
}

Set-Location ..

# Step 4: Verificar se APK foi criado
if (Test-Path $APK_PATH) {
    $APK_SIZE = (Get-Item $APK_PATH).Length / 1MB
    Write-Host ""
    Write-Host "✅ APK compilado com sucesso!" -ForegroundColor Green
    Write-Host "📁 Localização: $APK_PATH" -ForegroundColor Cyan
    Write-Host "📊 Tamanho: $($APK_SIZE.ToString('F2')) MB" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "💡 Para instalar no dispositivo:" -ForegroundColor Yellow
    Write-Host "   adb install -r $APK_PATH" -ForegroundColor Cyan
} else {
    Write-Host "❌ APK não foi criado!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 Compilação finalizada!" -ForegroundColor Green
