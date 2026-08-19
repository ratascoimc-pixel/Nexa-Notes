# NOTZ v1.4

NOTZ is the rebranded and redesigned continuation of the working Nexa Notes v1.4 beta, now presented as part of the **Master Key One** family.

## What changed

- All user-facing branding is now **NOTZ**.
- Uses the supplied official NOTZ / Master Key One icon.
- Premium dark navy / near-black interface with gold accents.
- Redesigned recording screen with moving waveform, timer, long-recording protection, pause/resume, stop/save, and quick library access.
- Redesigned library with search and filters for Study Notes, Outlines, and Transcripts.
- Existing transcript and study-note flow remains supported.
- The v1.4 organization backend is now surfaced in the app for Detailed Outline, Simple Outline, Summary, Key Points, Q&A Review, and References.
- Study notes and organized outputs can be exported to persistent PDFs and shared.
- Translation remains optional and is not required for this build.

## Compatibility decision

A few **internal-only** legacy identifiers are intentionally retained:

- Android package / iOS bundle ID: `com.nexanotes.app`
- Expo slug and scheme
- Local recording-library filename

Those identifiers are not user-facing. Keeping them is intentional so a signed upgrade can replace the existing beta and continue reading recordings already stored by the older app.

## Backend requirement

The phone app never contains the OpenAI API key. It expects a deployed HTTPS backend through:

```env
EXPO_PUBLIC_API_BASE_URL=https://YOUR-WORKING-NOTZ-BACKEND
```

The included `server/` is the v1.4 backend with NOTZ branding. Translation can remain unconfigured.

Server environment:

```env
OPENAI_API_KEY=your_key_here
PORT=8787
NOTES_MODEL=gpt-5-mini
# GOOGLE_TRANSLATE_API_KEY is optional for now
```

## Android APK

The `preview` EAS profile is already configured for an installable APK:

```bash
npm install
npx eas build --platform android --profile preview
```

The working backend URL must be supplied as `EXPO_PUBLIC_API_BASE_URL` during the build.

## Source basis

This rebrand was prepared from GitHub repository `ratascoimc-pixel/Nexa-Notes`, main commit:

`b440ce5329607d9cda9e890e355f491961f44abb` — “Update Nexa Notes server to v1.4”.
