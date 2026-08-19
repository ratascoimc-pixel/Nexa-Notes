# Build NOTZ from a phone/tablet

This package already includes the API base URL used by the working v1.4 beta:

EXPO_PUBLIC_API_BASE_URL=https://nexa-notes.onrender.com

Recommended cloud workflow:
1. Create/open a GitHub Codespace for ratascoimc-pixel/Nexa-Notes.
2. Upload this ZIP into the Codespace and unzip it.
3. Open a terminal in the unzipped Notz-v1.4 directory.
4. Run: npm install
5. Run: npx eas-cli@latest login
6. Run: npx eas-cli@latest build --platform android --profile preview
7. Follow the Expo prompts for project linking/signing if shown.
8. When EAS finishes, open the build page on the Android phone and tap Install.

The preview profile in eas.json is configured to create an installable APK.
