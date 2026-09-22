# VIBE²X Architecture and Project Plan

## Existing Architecture Summary
Vibe2X uses a strictly layered architecture to separate UI from playback and stream resolution:
`UI -> MusicService -> ProviderAdapter -> TrackResolver -> PlaybackEngine`

The app is built with Expo (React Native) and uses an Android-native module (`note-native`) for resolving playable audio streams using the NewPipe Extractor.
The `PlaybackEngine` manages a single audio session using `expo-audio`. `MusicService` handles the queue and library management locally on the device.

## Existing Features
- **Search**: Search for songs, artists, albums, and playlists.
- **Background Playback**: Continuous playback with the screen off via a foreground service.
- **Lock-screen Controls**: Notification-based media controls (play/pause, skip, seeking).
- **Queue Management**: Adding, removing, reordering, shuffling, and repeating tracks.
- **Library & History**: Local storage of liked songs, playlists, and listening history.
- **Resumable State**: Queue and playback position are persisted across app restarts.
- **Seek Bar**: Functional scrub bar for exact positioning.

## Important Files/Modules
- `src/playback/PlaybackEngine.ts`: Manages the actual `expo-audio` player, state, and native media session.
- `src/services/MusicService.ts`: Application-level orchestrator for queue, playback state, and provider interactions.
- `src/providers/stream/NativeStreamSource.ts`: Interfaces with the Android-native module for resolving streams.
- `modules/note-native`: Android Kotlin module linking the NewPipe Extractor to fetch stream URLs.
- `src/constants/theme.ts`: Contains the design system, colors, sizes, and fonts.
- `App.tsx` & `app.json`: Core application entry and Expo configuration.

## Components That Should Not Be Changed Casually
- **PlaybackEngine & Media Session Management**: `expo-audio` handles the single MediaSession. Modifying this carefully is crucial to avoid breaking background playback and lock-screen controls.
- **ProviderAdapter / TrackResolver Layer**: The abstraction that allows swapping or adding stream sources. Breaking this contract breaks audio resolution.
- **Native Stream Resolution (`note-native`)**: Modifying the Kotlin implementation connecting to NewPipe Extractor could break core streaming capability or violate GPL terms if the extractor library is altered inappropriately.
- **Local Storage Schema (`useLibrary` / `MusicService`)**: Changing how history or playlists are stored could wipe user data.

## Current Build Process
1. `npm install` to install JavaScript/React Native dependencies.
2. `npx expo prebuild --platform android` to generate the native Android project (the `android/` directory is gitignored).
3. `npm run android` to build and install the debug APK on a connected device/emulator.
Note: Requires Node.js 20+, JDK 17+, and Android SDK.

## Vibe2X Rebranding Changes Made
- **App Name & Slug**: Uses "Vibe2X" consistently in `app.json` and `package.json`.
- **Brand Colors**: Replaced the subtle Spotify-like green accent with the VIBE²X electric magenta (`#D000FF`) and electric violet (`#7000FF`) accents across the app (`theme.ts`, `NowPlaying.tsx`, `TrackRow.tsx`, `AddToPlaylistSheet.tsx`).
- **UI Labels**: Uses "VIBE²X" consistently in `NowPlaying`, `Search`, `Library`, `Settings`, and `PlaybackSourceSheet`.
- **Attribution**: Retains all legally required GPL-3.0-or-later references and original copyrights while presenting Vibe2X as its own product.

## Potential Technical Risks
- **Upstream Breakage**: The NewPipe Extractor may break if YouTube changes its API, requiring an update to the `note-native` dependency.
- **React Native / Expo Upgrades**: Upgrading Expo versions can sometimes introduce regressions in `expo-audio` or background execution limits on newer Android versions.
- **Memory/Performance**: The app holds queue and history in memory; extremely large queues might affect performance on lower-end devices.

## Recommended Extension Points for Future Features
- **EndpointStreamSource**: Implementing new custom stream resolvers to support alternative backend sources without touching native code.
- **ProviderAdapter**: Adding support for new metadata providers (e.g., Spotify, Apple Music) for search and library content.
- **UI Layer (`src/screens`)**: The UI is decoupled from playback logic, making it safe to radically redesign screens or add new visualizations (e.g., lyrics, visualizers) without breaking core audio.

## GPL/Attribution Considerations
- Vibe2X must remain licensed under **GPL-3.0-or-later** because it links the NewPipe Extractor.
- Any distributed binary (APK) of Vibe2X must be accompanied by the complete corresponding source code.
- Original copyright notices (e.g., "Copyright © 2026 Sanyam Jain" and "Team NewPipe") must be preserved in the Settings screen and `LICENSE`/`COPYRIGHT` files.

## Phased Feature Roadmap
- **Phase 1: Foundation (Current)** - Establish the Vibe2X brand identity (dark-first, magenta/violet accents) and verify the build process without breaking existing playback.
- **Phase 2: Enhanced Discovery** - Implement advanced sorting, filtering, and personalized recommendations within the Library and Search screens.
- **Phase 3: Social & Sharing** - Add features to export/import playlists easily or share currently playing tracks to social platforms (using standard Android intents, no backend required).
- **Phase 4: Audio Enhancements** - Introduce a local equalizer or visualizer, leveraging the `expo-audio` or native APIs, keeping the "play it your way" ethos.
