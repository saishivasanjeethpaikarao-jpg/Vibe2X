<div align="center">
  <img src="assets/icon.png" alt="Vibe2X logo" width="180">

# Vibe²X

**Find your vibe. Play it your way.**

An open-source, local-first music player for Android.

[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-7B2CFF.svg)](LICENSE)
[![Platform: Android](https://img.shields.io/badge/platform-Android-3DDC84.svg)](#build-from-source)
[![Expo SDK 57](https://img.shields.io/badge/Expo_SDK-57-000020.svg)](https://docs.expo.dev/versions/v57.0.0/)
</div>

## Project status

Vibe2X is under active development and does not currently publish an official release from this repository. Build it from source if you want to evaluate it. The generated `android/` project, signing keys, and release binaries are intentionally not tracked.

## Available now

The following capabilities are implemented in the current source:

- Search for tracks, artists, albums, and public playlists through the YouTube Music metadata provider.
- Android stream resolution through the bundled `note-native` Expo module and NewPipe Extractor.
- Optional user-configured Invidious, Piped, or custom playback resolver endpoints.
- Play, pause, seek, volume, previous/next, shuffle, repeat-one, repeat-all, and sleep timer controls.
- A persistent queue with play-next, add, remove, clear, jump, drag-to-reorder, and swipe actions.
- Background audio configuration and Android media-notification/lock-screen integration through `expo-audio`.
- Liked tracks, local playlists, imported provider playlists, pinning, renaming, and deletion.
- On-device audio scanning through Android MediaLibrary permissions.
- Recently played items, listening history, search history, and persisted playback position.
- Related-track autoplay with local suppression and recent-play penalties.
- Local profile/settings storage and JSON library-backup export.

These are source-level capabilities, not a claim that every device, Android version, provider response, or network condition has been tested. See [Verification status](#verification-status).

## Implemented, awaiting device verification

- Transactional YouTube and YouTube Music playlist import with complete continuation pagination, unavailable-item reporting, and collision-safe local copies.
- Spotify playlist metadata import in configured builds: Authorization Code with PKCE, explicit match review, and conversion to independently playable Vibe2X tracks. Spotify currently exposes playlist items only for playlists the authenticated user owns or collaborates on.

These import paths are intentionally not listed under **Available now** until end-to-end Android UI testing is complete. The deterministic and live-provider checks completed so far are recorded under [Verification status](#verification-status).

## Planned, not available yet

- A configured lyrics provider and lyrics UI.
- A complete local-provider implementation for local search, metadata browsing, and local playlists.
- More advanced discovery, sorting, and filtering.
- End-user playlist-file import/export and social sharing workflows.
- Equalizer and audio visualizer features.
- Published, signed release builds and store distribution.

## Architecture

Vibe2X keeps discovery, provider normalization, stream resolution, playback, and UI concerns separate:

```text
UI
 └─ MusicService
     └─ Provider registry / TrackResolver
         ├─ YouTubeResolver
         └─ LocalResolver

Playback request
 └─ provider resolve(track)
     ├─ NativeStreamSource (Android / NewPipe Extractor)
     ├─ EndpointStreamSource (configured Invidious, Piped, or custom endpoint)
     └─ LocalResolver (on-device audio)
         └─ PlaybackEngine (expo-audio)

Playlist import
 └─ PlaylistImportEngine
     ├─ existing YouTubeResolver playlist metadata
     └─ Spotify Web API metadata (OAuth PKCE)
         └─ MusicService search → confidence review → local Playlist
```

Important boundaries:

- `src/services/MusicService.ts` is the UI-facing music service.
- `src/providers/TrackResolver.ts` defines the normalized provider contract.
- `src/providers/stream/StreamResolver.ts` owns the pluggable remote stream-source chain.
- `src/playback/PlaybackEngine.ts` owns the single `expo-audio` player and media session.
- `src/playback/queue.ts` owns queue ordering, shuffle, and repeat behavior.
- `modules/note-native/` is the Android-native Expo module boundary.
- `src/services/LibraryService.ts` and `src/core/lie.ts` own local persistence and listening history.
- `src/features/playlistImport/` owns URL parsing, source pagination, Spotify authentication, matching confidence, and transactional import preparation. It does not resolve or play Spotify audio.

## Build from source

### Prerequisites

- Node.js 22.13 or newer (Expo SDK 57 minimum)
- npm
- JDK 17 or 21
- Android Studio and Android SDK 36
- `ANDROID_HOME` configured for your Android SDK

### Reproducible debug build

```bash
git clone https://github.com/saishivasanjeethpaikarao-jpg/Vibe2X.git
cd Vibe2X
npm ci
npx expo-doctor
npx tsc --noEmit
npm test
npx expo prebuild --platform android --clean
```

On macOS or Linux:

```bash
cd android
./gradlew clean assembleDebug
```

On Windows PowerShell:

```powershell
Set-Location android
.\gradlew.bat clean assembleDebug
```

The debug APK is normally written under `android/app/build/outputs/apk/debug/`. To build and install on a connected Android device or emulator, use `npm run android` after prebuild.

Release signing is intentionally not configured in Git. Supply your own signing credentials outside the repository if you create a release build.

## Configuration

Vibe2X can resolve Android playback on-device through NewPipe Extractor. The playback-source sheet also accepts an endpoint you operate or are authorized to use:

- Invidious base URL
- Piped base URL
- Custom resolver URL, optionally containing `{id}`

Resolver settings are stored locally on the device. Do not enter credentials into a resolver URL.

### Spotify playlist import

Spotify is used only as a playlist metadata source. Imported tracks are matched to the existing Vibe2X YouTube provider and saved as ordinary local Vibe2X playlist entries; later playback does not require Spotify.

Spotify requires a developer application and user authorization. Vibe2X uses Authorization Code with PKCE for this public mobile client and never uses a client secret. To enable it in a source build:

1. Create or select a Spotify developer application.
2. Register `vibe2x-spotify://oauth/callback` as a redirect URI.
3. Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` to the application's public client ID.
4. Rebuild the native app; OAuth schemes are native configuration and cannot be added by an over-the-air update.

Never place a Spotify client secret, access token, or refresh token in the repository or APK. OAuth tokens are stored with `expo-secure-store` on the device and are not logged.

Current Spotify Web API limits materially constrain this feature: playlist items are available only for playlists the signed-in user owns or collaborates on. Development Mode also requires the app owner to have Spotify Premium and limits access to allowlisted users and the account's quota. A `403` is therefore reported as a permissions/restriction error rather than bypassed with scraping. Vibe2X does not use private Spotify endpoints, embed scraping, hard-coded tokens, Spotify audio, or a client-secret backend.

Spotify metadata views link back to the source playlist and use Spotify's unmodified official attribution asset. Vibe2X does not copy Spotify artwork into the saved local playlist.

## Data and network behavior

Vibe2X has no Vibe2X account system, analytics SDK, telemetry service, or project-operated backend in this repository. Likes, playlists, queue state, history, profile, and settings are stored on the device with AsyncStorage and SQLite.

The app does make network requests needed for search, metadata, playlist import, related tracks, artwork, and streaming. Depending on the selected path, those requests go to YouTube/YouTube Music, the official Spotify Web API, Google-hosted media URLs, or a resolver endpoint configured by the user. A JSON backup can be exported through the operating system share sheet only when the user requests it.

## Verification status

The repository includes deterministic Vitest coverage for playlist URL parsing, Spotify-to-Vibe2X matching, both providers' pagination, unavailable and duplicate rows, cancellation, mid-pagination failure, repeated imports, name collisions, and Spotify 401/403/quota handling. The playlist-import build has passed TypeScript, Expo Doctor, a clean Expo prebuild, and an Android production JavaScript bundle. A live read-only YouTube Music metadata probe followed all seven continuation pages of a 655-item playlist successfully.

Spotify OAuth and Web API behavior has not been exercised with a real client ID/account in this repository. Native compilation and real-device UI behavior also remain unverified on this host because Gradle fails before project evaluation with `Unable to establish loopback connection`, and no device/emulator is connected. Playback, queue, background audio, notification controls, and provider streaming were not changed by playlist import, but still require device regression checks before release.

## Contributing

Keep changes focused and preserve the existing service/provider/playback boundaries. Before opening a pull request, run:

```bash
npm ci
npx expo-doctor
npx tsc --noEmit
npm test
npx expo export --platform android
npx expo prebuild --platform android --clean
```

If your environment supports Android builds, also run `assembleDebug` from a freshly generated native project. Do not commit `android/`, `ios/`, build outputs, signing material, or local environment files.

## License and attribution

Vibe2X is licensed under the **GNU General Public License, version 3 or (at your option) any later version**. See [LICENSE](LICENSE) and [COPYRIGHT](COPYRIGHT).

Vibe2X includes code originally created for **NØTE** by **Sanyam Jain**. The original attribution and copyright are preserved in [COPYRIGHT](COPYRIGHT).

The Android native module links **NewPipe Extractor v0.26.5**, copyright Team NewPipe and contributors, under GPL-3.0-or-later. Vibe2X is not affiliated with or endorsed by Team NewPipe, Google, YouTube, or Spotify. Spotify names and marks belong to Spotify AB. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for notices and dependency details.

If you distribute a Vibe2X binary or derivative, you are responsible for complying with GPL-3.0-or-later, including providing the corresponding source and preserving applicable notices.
