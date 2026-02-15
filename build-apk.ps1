# build-apk.ps1 - Script para compilar APK do FarmoLink (Windows)
# Uso: .\build-apk.ps1 -Type debug
# Ou:  .\build-apk.ps1 -Type release

param(
    [ValidateSet("debug", "release")]
    [string]$Type = "debug"
)

function Test-ValidJavaHome {
    param([string]$JavaHome)
    if ([string]::IsNullOrWhiteSpace($JavaHome)) {
        return $false
    }

    return (Test-Path (Join-Path $JavaHome "bin\java.exe")) -and
           (Test-Path (Join-Path $JavaHome "lib\jvm.cfg"))
}

function Ensure-JavaHome {
    if (Test-ValidJavaHome $env:JAVA_HOME) {
        return
    }

    $javaCmd = Get-Command java -ErrorAction SilentlyContinue
    if ($javaCmd) {
        $candidate = Split-Path (Split-Path $javaCmd.Source -Parent) -Parent
        if (Test-ValidJavaHome $candidate) {
            $env:JAVA_HOME = $candidate
            Write-Host "JAVA_HOME ajustado automaticamente para: $env:JAVA_HOME" -ForegroundColor Cyan
        }
    }

    if (-not (Test-ValidJavaHome $env:JAVA_HOME)) {
        Write-Host "Erro: JAVA_HOME invalido. Configure um JDK 17 valido no Windows." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Iniciando compilacao do APK FarmoLink..." -ForegroundColor Green
Write-Host "Tipo de build: $Type" -ForegroundColor Cyan
Ensure-JavaHome

$rootDir = Get-Location

# Step 1: Build da Web
Write-Host ""
Write-Host "1) Compilando aplicacao web..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro na compilacao web!" -ForegroundColor Red
    exit 1
}

# Step 2: Sync com Android
Write-Host ""
Write-Host "2) Sincronizando com Android..." -ForegroundColor Yellow
npx cap sync android

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao sincronizar!" -ForegroundColor Red
    exit 1
}

# Step 3: Compilar APK
Write-Host ""
Write-Host "3) Compilando APK ($Type)..." -ForegroundColor Yellow
$androidDir = Join-Path $rootDir "android"
Set-Location $androidDir

if ($Type -eq "release") {
    .\gradlew.bat assembleRelease
    $APK_PATH = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"
} else {
    .\gradlew.bat assembleDebug
    $APK_PATH = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro na compilacao do Gradle!" -ForegroundColor Red
    Set-Location $rootDir
    exit 1
}

Set-Location $rootDir

# Step 4: Verificar se APK foi criado
if (Test-Path $APK_PATH) {
    $APK_SIZE = (Get-Item $APK_PATH).Length / 1MB
    Write-Host ""
    Write-Host "APK compilado com sucesso!" -ForegroundColor Green
    Write-Host "Localizacao: $APK_PATH" -ForegroundColor Cyan
    Write-Host "Tamanho: $($APK_SIZE.ToString('F2')) MB" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Para instalar no dispositivo:" -ForegroundColor Yellow
    Write-Host "  adb install -r $APK_PATH" -ForegroundColor Cyan
} else {
    Write-Host "APK nao foi criado!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Compilacao finalizada!" -ForegroundColor Green
