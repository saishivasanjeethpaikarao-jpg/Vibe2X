<!-- impeccable:product-schema 1 -->

# Vibe2X product contract

## Platform

android

## Platform context

Android-first React Native application built with Expo SDK 57. The same source also supports iOS and web, but Android behavior and performance are the primary acceptance target for this phase.

## Purpose

Vibe2X is an independent, local-first music player that lets people discover and play music through the app's existing providers, play local audio, manage likes, history, queues and local playlists, and import supported YouTube or Spotify playlists into normal local Vibe2X playlists.

## Users

People who want a fast, expressive music player with local control over their library and queue, dependable background playback, and a clear distinction between discovery metadata and playable audio sources.

## Product principles

- Playback must remain dependable while the interface is animated or visually rich.
- Real user and provider data is always preferred to fabricated recommendations or demo content.
- Imported playlists become ordinary local playlists and remain useful without continuous access to their source service.
- Search, playback, queue and library actions should remain direct and predictable.
- Vibe2X is not affiliated with Spotify, YouTube, or Apple and must not imitate their interfaces.

## Brand commitments

- Product name: Vibe2X.
- Design language: Liquid Vibe.
- Character: premium, dark-first, musical, smooth, minimal, youthful, and original.
- The existing Vibe2X crossed-flow mark and violet-to-magenta brand spectrum are the primary identity assets.
- Materials may feel translucent, layered, softly blurred, and artwork-responsive, but effects must remain restrained and readable.
- Avoid generic AI gradients, excessive neon, bloom, fake 3D, decorative particles, and glass on every surface.

## Functional boundaries

- Preserve PlaybackEngine, MusicService playback behavior, ProviderAdapter and TrackResolver contracts, stream resolution, queue semantics, background playback, notification and lock-screen controls, and native Kotlin playback code.
- UI consumes existing hooks and services; business logic does not move into visual components.
- Only sections backed by current app data may be shown.
- Existing local playlists, likes, history, local music, playlist import, reorder/remove actions, and source attribution remain available.

## Accessibility and performance

- Respect reduced motion and font scaling.
- Provide clear screen-reader labels, non-color-only selected states, and at least 48dp primary touch targets.
- Keep foreground contrast readable over all artwork and glass materials.
- Prefer native/Reanimated transitions without continuous JS-thread loops.
- Cache or avoid expensive artwork processing; visual effects must never compromise playback.
- Android devices below API 31 use opaque/translucent fallbacks instead of expensive blur.

## Evidence policy

- Do not fabricate screenshots, recommendations, listening history, or feature claims.
- Runtime visual claims require actual device or emulator verification.
- README changes describe only implemented and verified behavior.
