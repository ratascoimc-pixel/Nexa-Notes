# Build NOTZ as an Android APK

## Required before the build

1. A working public HTTPS URL for the included transcription/organization backend.
2. Expo/EAS account access that owns or can create the Android build credentials.

## Build command

Set the backend URL, then run the preview build:

### Windows PowerShell

```powershell
$env:EXPO_PUBLIC_API_BASE_URL="https://YOUR-WORKING-BACKEND"
npm install
npx eas build --platform android --profile preview
```

### macOS / Linux

```bash
export EXPO_PUBLIC_API_BASE_URL="https://YOUR-WORKING-BACKEND"
npm install
npx eas build --platform android --profile preview
```

EAS will return an install page for the APK. That page can be opened directly on the Android phone or converted to a QR code.

## Important

Do not change `com.nexanotes.app` before the first NOTZ test build if the goal is to replace the existing beta and preserve its on-device data. A new package ID would make Android treat NOTZ as a separate app.
