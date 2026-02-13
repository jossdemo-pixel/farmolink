# 🔧 ANDROID STUDIO - COMO ABRIR SEU PROJETO

## Status Atual ✅

Seu projeto está **100% pronto** para ser aberto no Android Studio:
- ✅ `npm run build` - Compilado com sucesso
- ✅ `npx cap sync android` - Sincronizado com Android
- ✅ Pasta `c:\farmolink\android` - Pronta para abrir

## Opção 1: Abrir Pasta Diretamente (RECOMENDADO)

1. **Abra o Explorer** e navegue até: `c:\farmolink\android`
2. **Clique com botão direito** em qualquer espaço vazio
3. **Selecione**: "Abrir com Android Studio"
4. Android Studio vai carregar automaticamente o projeto Gradle

## Opção 2: Abrir via Android Studio (Se já está instalado)

1. **Abra Android Studio**
2. **Clique em**: File → Open
3. **Navegue até**: `c:\farmolink\android`
4. **Clique em**: Open

## Opção 3: Linha de Comando (Se Android Studio está no PATH)

```powershell
cd c:\farmolink\android
studio .
```

## Opção 4: Instalar Android Studio (Se não tem)

1. Baixe em: https://developer.android.com/studio
2. Execute o instalador
3. Escolha as opções:
   - ✅ Android SDK
   - ✅ Android SDK Platform
   - ✅ Google Play Services
   - ✅ Android Emulator
4. Após instalar, use Opção 1 ou 2

## 📝 Próximos Passos no Android Studio

Quando abrir o projeto:

1. **Espere o Gradle sincronizar** (pode levar 2-3 minutos na primeira vez)
2. **Resolva problemas** (se houver):
   - Download de SDK se necessário
   - Aceite licenças do SDK
3. **Build > Build Bundle(s) / APK(s) > Build APK(s)**
4. Espere a compilação (2-5 minutos)
5. Seu APK estará em: `android/app/build/outputs/apk/debug/app-debug.apk`

## ✨ Detalhes da Compilação

### Arquivo de Saída
```
c:\farmolink\android\app\build\outputs\apk\debug\app-debug.apk
```

### Tamanho Esperado
- Debug APK: ~50-80 MB
- Release APK: ~40-60 MB (otimizado)

### Requisitos Mínimos
- Java JDK 11 ou superior
- Android SDK 21+ (recomendado 33+)
- 5GB de espaço em disco livre
- Android Emulator ou dispositivo físico (Android 8.0+)

## 🚀 Instalar APK em Dispositivo

Após compilar, instale com ADB:

```powershell
# Se tem dispositivo conectado
adb install -r c:\farmolink\android\app\build\outputs\apk\debug\app-debug.apk

# Ou especifique o dispositivo
adb -s <device_id> install -r app-debug.apk
```

## 🎙️ Testar Text-to-Speech

1. Abra o app no dispositivo
2. Faça login
3. Você deve ouvir: **"Olá [Name], seja bem vindo ao FarmoLink"** em voz

Se não ouvir:
- Verifique se o som está ativado
- Verifique se o Google Text-to-Speech está instalado
- Procure no logcat: `adb logcat | grep -i "text-to-speech"`

## 📞 Problemas Comuns

| Problema | Solução |
|----------|---------|
| "Gradle sync failed" | `./gradlew clean` então sincronize |
| "SDK not found" | Abra SDK Manager e instale Android SDK 33+ |
| "APK não instala" | `adb uninstall com.farmolink` e tente novamente |
| "Voz não funciona" | Instale Google Text-to-Speech no dispositivo |
| "Build fails" | `./gradlew clean && ./gradlew assembleDebug` |

---

**Documentação Completa:** Veja `ANDROID_BUILD_INSTRUCTIONS.md`  
**Status do Projeto:** 🟢 PRONTO PARA COMPILAÇÃO

