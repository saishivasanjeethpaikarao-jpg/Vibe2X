<div align="center">
  <img src="assets/icon.png" alt="Vibe2X logo" width="180">

# Vibe²X

**Find your vibe. Play it your way.**

An open-source, local-first mobile music player.

[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-7B2CFF.svg)](LICENSE)
[![Expo SDK 57](https://img.shields.io/badge/Expo_SDK-57-000020.svg)](https://docs.expo.dev/versions/v57.0.0/)
</div>

## Project status

Vibe2X is under active development. Version `0.1.0` is configured as the first public version, but tag `v0.1.0` and an official release have **not** been created. Generated native projects, signing keys, and release binaries are intentionally not tracked.

Release blocker: the current `expo-audio` native media session exposes seek-back/seek-forward rather than Previous/Next track commands. In-app Previous/Next exists, but Android notification/lock-screen and iOS Control Center transport parity is not verified or complete. Do not treat a successful build as approval to publish.

| Mobile platform | Current status |
| --- | --- |
| Android | **Device QA candidate**. A standalone QA APK is built by GitHub Actions; playback and system-control defects are under retest. No official `v0.1.0` release exists. |
| iOS | **Simulator build verification only**. Online playback on a fresh install is blocked without a configured resolver endpoint; signed iPhone and TestFlight runtime behavior are unverified. |

## Download & Installation

**Android QA**
- Download the `Vibe2X-LiquidVibe-QA.apk` artifact from a successful [Android standalone QA workflow run](https://github.com/saishivasanjeethpaikarao-jpg/Vibe2X/actions/workflows/android-qa.yml). It is QA-signed and is not the official release.

**iOS**
- No physical-iPhone build or TestFlight candidate is currently verified. The simulator CI build is not installable on an iPhone.

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
- Shared Auto Continue draws candidate tracks from the current song's provider-related results and active search context. Likes, searches, and listening history adjust ranking rather than directly filling the queue; recent plays and suppressed tracks are filtered. Recommendation quality is awaiting device retest.
- Local profile/settings storage and JSON library-backup export.

These are source-level capabilities, not a claim that every device, Android version, provider response, or network condition has been tested. See [Verification status](#verification-status).

## Implemented, awaiting device verification

- Transactional YouTube and YouTube Music playlist import with complete continuation pagination, unavailable-item reporting, and collision-safe local copies.
- Local CSV/TXT playlist-file parsing and matching with high-confidence selection, explicit review for uncertain results, unavailable-row reporting, and normal local-playlist saving. The three-method Import Playlist UI directs YouTube links to the existing importer and Spotify/other-service exports to File Import. Real-device QA found CSV/TXT failures; the latest parser and matching repairs await another device test.
- The direct Spotify Web API/PKCE implementation is retained for development, but is not the primary user-facing import path. It has not been tested with a real Spotify account or client ID; Spotify currently restricts playlist-item access to playlists the authenticated user owns or collaborates on.

These import paths are intentionally not listed under **Available now** until end-to-end Android UI testing is complete. The deterministic and live-provider checks completed so far are recorded under [Verification status](#verification-status).

## Planned, not available yet

- A configured lyrics provider and lyrics UI.
- A complete local-provider implementation for local search, metadata browsing, and local playlists.
- More advanced discovery, sorting, and filtering.
- Playlist-file export and social sharing workflows.
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
     ├─ local CSV/TXT metadata parser
     └─ retained Spotify Web API metadata (OAuth PKCE)
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

### Android prerequisites

- Node.js 22.13 or newer (Expo SDK 57 minimum)
- npm
- JDK 17 or 21
- Android Studio and Android SDK 36
- `ANDROID_HOME` configured for your Android SDK

### Android debug build

```bash
git clone https://github.com/saishivasanjeethpaikarao-jpg/Vibe2X.git
cd Vibe2X
npm ci
npx expo-doctor
npx tsc --noEmit
npm test
npx expo prebuild --platform android --clean
cd android
./gradlew assembleDebug
```

The debug APK is normally written under `android/app/build/outputs/apk/debug/`. It is a development build, not the standalone public release. The release workflow builds `:app:assembleRelease` with embedded Hermes JavaScript and verifies the signature, launcher, and bundle before publication.

### iOS simulator verification

The [iOS build workflow](.github/workflows/ios-build.yml) runs on GitHub macOS CI, generates a clean native iOS project, installs CocoaPods, and builds a Release-configuration simulator `.app` with `CODE_SIGNING_ALLOWED=NO`. This verifies compilation only; it does not produce an installable physical-iPhone build or establish iOS playback support. The bundled `note-native` stream extractor is Android-only, and iOS playback would need separate runtime verification.

### Release identity and signing

Both application identifiers are configured as `io.github.saishivasanjeethpaikarao.vibe2x`. Expo version is `0.1.0`, Android `versionCode` is `1`, and iOS `buildNumber` is `1`. Increase the platform build numbers for future distributed builds. Store availability and ownership of the identifier are not yet verified.

The new Android identifier installs separately from earlier `com.sanyamjain04.NOTE` QA builds and does not inherit their local data. Export a backup before removing an old QA installation. Keep only the intended Vibe2X build installed when testing custom-scheme links, because old and new builds can both register the same schemes.

The [Android release workflow](.github/workflows/android-release.yml) runs only for a stable `vX.Y.Z` tag whose commit is on `main` and whose version matches Expo and npm metadata. It also gates publication on the unsigned iOS simulator build. For the first release, the tag would be `v0.1.0`; **do not push it until the app and signing setup have been approved**. The workflow requires these GitHub Actions secrets:

| Secret | Purpose |
| --- | --- |
| `VIBE2X_KEYSTORE_BASE64` | Base64-encoded bytes of the persistent Android release keystore; base64 is not encryption. |
| `VIBE2X_KEYSTORE_PASSWORD` | Keystore password. |
| `VIBE2X_KEY_ALIAS` | Signing-key alias. |
| `VIBE2X_KEY_PASSWORD` | Key password. |

Keep the original keystore backed up securely: Android updates must use the appropriate established signing identity. The workflow fails without these secrets and never substitutes an ephemeral QA or Android debug key. It uploads a verified APK as a workflow artifact and creates a GitHub Release with that APK only after the tag build succeeds. No keystore or password belongs in Git or the APK.

The app retains `vibe2x://` deep links and `vibe2x-spotify://oauth/callback` for the retained direct Spotify PKCE path. Changing Android/iOS identifiers does not intentionally change these schemes. Clean prebuild can verify their native registration; actual deep-link and OAuth round trips still require runtime testing, and the Spotify redirect must remain registered with the developer application.

## Configuration

Vibe2X can resolve Android playback on-device through NewPipe Extractor. The playback-source sheet also accepts an endpoint you operate or are authorized to use:

- Invidious base URL
- Piped base URL
- Custom resolver URL, optionally containing `{id}`

Resolver settings are stored locally on the device. Do not enter credentials into a resolver URL.

### Spotify playlist import

The user-facing Spotify route uses File Import: export a playlist as CSV or TXT with an external service such as [TuneMyMusic](https://www.tunemymusic.com/transfer/spotify-to-file), download the file, and choose it in Vibe2X. TuneMyMusic is not affiliated with Vibe2X. Vibe2X reads the selected file locally, matches song metadata to its existing playable provider, asks for review of uncertain matches, and saves a normal local playlist. It does not use Spotify audio. File Import is currently awaiting Android device QA.

The direct Spotify OAuth/PKCE implementation remains in the source for development but is not the primary import screen path. A public client ID is **not required** for CSV/TXT File Import. For development of the direct API path only:

Spotify requires a developer application and user authorization. Vibe2X uses Authorization Code with PKCE for this public mobile client and never uses a client secret. To enable it in a source build:

1. Create or select a Spotify developer application.
2. Register `vibe2x-spotify://oauth/callback` as a redirect URI.
3. Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` to the application's public client ID.
4. Rebuild the native app; OAuth schemes are native configuration and cannot be added by an over-the-air update.

For the `android-qa.yml` GitHub Actions build, set the repository variable **`EXPO_PUBLIC_SPOTIFY_CLIENT_ID`** in Settings → Secrets and variables → Actions → Variables only if testing the retained direct API path. The workflow passes this public identifier into Expo's bundle step. It is not a secret; anyone can inspect it in a distributed APK. Never put a Spotify Client Secret or token in that variable. Register `vibe2x-spotify://oauth/callback` for the same Spotify application before testing OAuth.

Never place a Spotify client secret, access token, or refresh token in the repository or APK. OAuth tokens are stored with `expo-secure-store` on the device and are not logged.

Current Spotify Web API limits materially constrain this feature: playlist items are available only for playlists the signed-in user owns or collaborates on. Development Mode also requires the app owner to have Spotify Premium and limits access to allowlisted users and the account's quota. A `403` is therefore reported as a permissions/restriction error rather than bypassed with scraping. Vibe2X does not use private Spotify endpoints, embed scraping, hard-coded tokens, Spotify audio, or a client-secret backend.

Spotify metadata views link back to the source playlist and use Spotify's unmodified official attribution asset. Vibe2X does not copy Spotify artwork into the saved local playlist.

## Data and network behavior

Vibe2X has no Vibe2X account system, analytics SDK, telemetry service, or project-operated backend in this repository. Likes, playlists, queue state, history, profile, and settings are stored on the device with AsyncStorage and SQLite.

The app does make network requests needed for search, metadata, playlist import, related tracks, artwork, and streaming. Depending on the selected path, those requests go to YouTube/YouTube Music, the official Spotify Web API, Google-hosted media URLs, or a resolver endpoint configured by the user. A JSON backup can be exported through the operating system share sheet only when the user requests it.

## Verification status

The repository includes deterministic Vitest coverage for playlist URL parsing, Spotify-to-Vibe2X matching, both providers' pagination, unavailable and duplicate rows, cancellation, mid-pagination failure, repeated imports, name collisions, and Spotify 401/403/quota handling. The playlist-import build has passed TypeScript, Expo Doctor, a clean Expo prebuild, and an Android production JavaScript bundle. A live read-only YouTube Music metadata probe followed all seven continuation pages of a 655-item playlist successfully.

The standalone Android QA APK has been tested on a real device. Those tests exposed first-launch NØTE branding, hidden Search-result continuation, a nonfunctional right-swipe queue action, an unreadable queue sheet, a rejected YouTube shared playlist, an unconfigured Spotify client ID, missing mutation feedback, and later CSV/TXT playlist-import failures. This branch contains repair candidates for those observations; successful tests or a new APK build do not establish that the repairs work on a device. Spotify OAuth and Web API import remain untested with a real client ID/account. Background playback, lock-screen controls, notifications, and persistence also require a fresh regression pass on the repaired APK.

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
