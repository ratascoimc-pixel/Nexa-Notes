# Nexa Notes — Working Beta 1.0

Cross-platform iOS/Android transcription and study-notes app.

## Working flow

1. Record continuously until the user stops.
2. Nexa Notes silently rotates the audio into protected 8-minute segments for safer long sessions.
3. Recordings are kept in the app document directory, not temporary cache.
4. Send all segments to the included backend for transcription and merge them in order.
5. Generate structured study notes from the transcript.
6. Generate a PDF, save a persistent copy in the app documents, and open the native share/save sheet.
7. Keep the original audio, transcript, notes, and PDF in the recording library until the user deletes them.

## Important architecture note

The OpenAI API key is intentionally **not** stored inside the phone app. The included `server/` is required for transcription and AI study-note generation. This prevents an API key from being extracted from an installed APK/IPA.

## Backend setup

```bash
cd server
npm install
cp .env.example .env
# put your API key in .env
npm start
```

`server/.env`:

```env
OPENAI_API_KEY=your_key_here
PORT=8787
NOTES_MODEL=gpt-5-mini
```

Deploy this server to a public HTTPS host before installing the app on a phone. Then create a root `.env`:

```env
EXPO_PUBLIC_API_BASE_URL=https://YOUR-BACKEND-HOST
```

## App setup

```bash
npm install
npx expo start
```

For background recording behavior, test a development/preview build rather than relying on iOS Expo Go.

## Android test APK

After signing in to Expo/EAS:

```bash
npx eas build --platform android --profile preview
```

This profile is configured in `eas.json` to produce an installable APK.

## iOS test build

```bash
npx eas build --platform ios --profile development
```

Apple signing/device registration is required for direct physical-device development builds.

## Included safeguards

- Long recording is not capped at 10 minutes.
- Background recording native configuration is enabled.
- Hidden segment rotation limits the damage from an individual-file interruption and keeps transcription uploads manageable.
- A ref-backed segment list prevents a React state timing race at Stop.
- The final paused duration is computed correctly.
- Re-transcribing clears stale notes/PDF references so output cannot silently mismatch the transcript.
- Generated PDFs are moved out of cache into persistent app storage.
- Deleting a recording also deletes its audio and saved PDF.
- The backend validates missing API configuration and removes temporary uploads after processing.

## Status

This is a working beta codebase. The remaining external step before full phone testing is deploying the included backend and providing its HTTPS URL. No OpenAI secret belongs in the mobile app.
