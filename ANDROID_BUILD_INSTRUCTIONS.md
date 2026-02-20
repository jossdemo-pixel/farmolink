# 📱 Instruções de Compilação APK - FarmoLink Android

## ✅ Pré-requisitos Instalados

- ✅ Node.js & npm
- ✅ Capacitor CLI
- ✅ Android SDK
- ✅ Java Development Kit (JDK 11+)
- ✅ Android Studio
- ✅ Gradle

## 🚀 Passos para Compilar APK

### 1. **Construir o Projeto Web (Já Feito)**
```bash
npm run build
```
✅ Build TypeScript/React compilado e otimizado em `dist/`

### 2. **Sincronizar com Android (Já Feito)**
```bash
npx cap sync android
```
✅ Assets e código JavaScript sincronizados com a pasta Android

### 3. **Abrir no Android Studio**
```bash
npx cap open android
```

Ou abrir manualmente:
- Localize a pasta `c:\farmolink\android`
- Abra `android/` no Android Studio

### 4. **Compilar APK via Android Studio**

#### Opção A: Interface Gráfica
1. Abra **Android Studio**
2. Vá para **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. Aguarde a compilação
4. APK gerado em: `android/app/build/outputs/apk/debug/app-debug.apk`

#### Opção B: Terminal (Gradle)
```bash
cd android
./gradlew assembleDebug
```

APK gerado em: `android/app/build/outputs/apk/debug/app-debug.apk`

### 5. **Compilar APK com Assinatura (Release)**

#### Via Android Studio:
1. **Build → Generate Signed Bundle / APK**
2. Escolha **APK**
3. Crie ou selecione seu Keystore
4. Escolha a variante **Release**
5. APK gerado em: `android/app/build/outputs/apk/release/app-release.apk`

#### Via Gradle:
```bash
cd android
./gradlew assembleRelease
```

## 🔧 Recursos Implementados

### 1. **Text-to-Speech Nativo (Android)**
- ✅ Plugin: `@capacitor-community/text-to-speech`
- ✅ Funcionalidade: Reproduz mensagens de boas-vindas em português
- ✅ Fallback: Web Speech API para navegadores

**Teste:**
- Faça login no app
- Você ouvirá: "Olá [Nome], seja bem vindo ao FarmoLink"

### 2. **Configurações de Recursos**
```
android/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml (Permissões)
│   │   └── res/ (Ícones e recursos)
│   └── build.gradle (Dependências)
├── build.gradle (Configuração)
└── gradle.properties (Propriedades)
```

### 3. **Permissões Android Necessárias**
Já configuradas em `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

## 📊 Variáveis de Build

### Debug APK
- **Tamanho**: ~50-80MB
- **Assinatura**: Automática (debug key)
- **Uso**: Testes e desenvolvimento
- **Instalação**: Direto no Android Studio ou via `adb`

### Release APK
- **Tamanho**: ~40-60MB (otimizado)
- **Assinatura**: Keystore privado
- **Uso**: Google Play Store / Distribuição
- **Instalação**: Envio para loja ou distribuição manual

## 🎯 Instalando no Dispositivo

### Via Android Studio:
1. Conecte o dispositivo Android via USB
2. Em Android Studio, clique em **Run** ou **Debug**
3. Selecione o dispositivo e clique **OK**

### Via ADB (Terminal):
```bash
# Instalar APK
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Instalar e executar
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.farmolink/.MainActivity
```

## 🐛 Troubleshooting

### Erro: "Gradle build failed"
**Solução:**
```bash
cd android
./gradlew clean
./gradlew build
```

### Erro: "Plugin not found: @capacitor-community/text-to-speech"
**Solução:**
```bash
npm install @capacitor-community/text-to-speech --save
npx cap sync android
```

### Text-to-Speech não funciona no APK
**Verificar:**
1. O dispositivo tem os dados de voz do Google TTS instalados?
2. O volume do dispositivo está mute?
3. As permissões foram concedidas?

**Teste de permissões:**
```bash
adb shell pm grant com.farmolink android.permission.INTERNET
```

### APK não instala
**Verificar:**
```bash
# Ver logs
adb logcat

# Desinstalar versão anterior
adb uninstall com.farmolink

# Instalar novamente
adb install app-debug.apk
```

## 📝 Estrutura de Arquivos Importantes

```
c:\farmolink\
├── dist/                          # Build compilado
├── android/                        # Projeto Android Studio
│   ├── app/
│   │   ├── build.gradle           # Dependências do app
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       └── res/               # Recursos (ícones, strings)
│   ├── build.gradle               # Gradle principal
│   └── gradle.properties           # Propriedades
├── capacitor.config.ts            # Configuração Capacitor
├── package.json                    # Dependências Node
└── services/soundService.ts        # Text-to-Speech implementation
```

## ✨ Próximos Passos

1. **Compilar APK Debug:**
   ```bash
   cd android && ./gradlew assembleDebug
   ```

2. **Testar no Emulador ou Dispositivo Real**

3. **Compilar APK Release para Google Play:**
   - Criar Keystore
   - Compilar com assinatura
   - Enviar para Play Store

4. **Monitorar Logs:**
   ```bash
   adb logcat | grep -i farmolink
   ```

## 📞 Suporte

Para problemas com a compilação, verifique:
- Versões do Gradle e Java
- Dependências npm e Capacitor
- Permissões de pasta (especialmente no Windows)
- Espaço em disco (mínimo 5GB)

---

**Status:** ✅ Projeto pronto para compilação APK
**Data:** 11 de Fevereiro de 2026
**Versão:** 1.0.0

## Push Notifications (App Fechado)

1. Instalar plugin push no app:
```bash
npm install @capacitor/push-notifications --save
npx cap sync android
```

2. Configurar Firebase Cloud Messaging (FCM):
- Criar projeto Firebase.
- Registrar app Android com o mesmo `applicationId`.
- Baixar `google-services.json` e colocar em `android/app/google-services.json`.
- Ativar Cloud Messaging.

3. Publicar dispatcher no Supabase:
```bash
supabase functions deploy push-dispatch
supabase secrets set FCM_PROJECT_ID=SEU_FIREBASE_PROJECT_ID
supabase secrets set FCM_CLIENT_EMAIL="firebase-adminsdk-xxxx@SEU_PROJETO.iam.gserviceaccount.com"
supabase secrets set FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSUA_CHAVE\n-----END PRIVATE KEY-----\n"
```

4. Fluxo no FarmoLink:
- `notifications` continua como historico no app.
- `push_tokens` guarda tokens ativos por utilizador/dispositivo.
- `push-dispatch` envia push para os tokens quando houver comunicado admin.
