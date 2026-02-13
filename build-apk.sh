#!/bin/bash
# build-apk.sh - Script para compilar APK do FarmoLink
# Uso: ./build-apk.sh [debug|release]

BUILD_TYPE=${1:-debug}

echo "🚀 Iniciando compilação do APK FarmoLink..."
echo "📦 Tipo de build: $BUILD_TYPE"

# Step 1: Build da Web
echo ""
echo "1️⃣ Compilando aplicação web..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Erro na compilação web!"
    exit 1
fi

# Step 2: Sync com Android
echo ""
echo "2️⃣ Sincronizando com Android..."
npx cap sync android

if [ $? -ne 0 ]; then
    echo "❌ Erro ao sincronizar!"
    exit 1
fi

# Step 3: Compilar APK
echo ""
echo "3️⃣ Compilando APK ($BUILD_TYPE)..."
cd android

if [ "$BUILD_TYPE" = "release" ]; then
    ./gradlew assembleRelease
    APK_PATH="app/build/outputs/apk/release/app-release.apk"
else
    ./gradlew assembleDebug
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
fi

if [ $? -ne 0 ]; then
    echo "❌ Erro na compilação do Gradle!"
    exit 1
fi

cd ..

# Step 4: Verificar se APK foi criado
if [ -f "$APK_PATH" ]; then
    APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
    echo ""
    echo "✅ APK compilado com sucesso!"
    echo "📁 Localização: $APK_PATH"
    echo "📊 Tamanho: $APK_SIZE"
    echo ""
    echo "💡 Para instalar no dispositivo:"
    echo "   adb install -r $APK_PATH"
else
    echo "❌ APK não foi criado!"
    exit 1
fi

echo ""
echo "🎉 Compilação finalizada!"
