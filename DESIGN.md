---
name: Vibe2X Liquid Vibe
description: A dark, musical interface built from smoked layers, artwork atmosphere, and restrained motion.
colors:
  background-primary: "#070708"
  background-elevated: "#0D0D11"
  background-amoled: "#000000"
  surface-glass: "rgba(24, 22, 30, 0.62)"
  surface-glass-strong: "rgba(24, 22, 30, 0.84)"
  surface-raised: "#15131A"
  surface-interactive: "#1B1822"
  surface-selected: "rgba(112, 0, 255, 0.18)"
  border-glass: "rgba(255, 255, 255, 0.09)"
  border-subtle: "rgba(255, 255, 255, 0.06)"
  border-focus: "rgba(208, 0, 255, 0.64)"
  text-primary: "#F8F7FA"
  text-secondary: "#A7A3AD"
  text-disabled: "#69666F"
  text-inverse: "#09070C"
  accent-violet: "#7000FF"
  accent-magenta: "#D000FF"
  accent-danger: "#FF5B6E"
typography:
  display:
    fontFamily: "System"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.1875
  title:
    fontFamily: "System"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
  section:
    fontFamily: "System"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.333
  body:
    fontFamily: "System"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontFamily: "System"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.333
rounded:
  sm: "10px"
  md: "16px"
  lg: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
  xxxl: "64px"
components:
  glass-surface:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
  glass-surface-strong:
    backgroundColor: "{colors.surface-glass-strong}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
  selected-indicator:
    backgroundColor: "{colors.surface-selected}"
    textColor: "{colors.accent-magenta}"
    rounded: "{rounded.pill}"
    height: "28px"
---

# Design System: Vibe2X Liquid Vibe

## Overview

**Creative North Star: "The Liquid Optical Instrument"**

Liquid Vibe is a dark-first music interface in which the content supplies the light. Smoked surfaces establish hierarchy, the existing violet-to-magenta identity marks selection and energy, and album artwork creates restrained atmosphere behind dependable controls. The result should feel premium, youthful, and musical without resembling another streaming product.

Expression is concentrated in navigation, the mini-player, modal sheets, and the Now Playing hero. Content lists stay calm and direct. Motion clarifies state changes; it never becomes ambient decoration or a prerequisite for playback.

**Key Characteristics:**

- Near-black tonal depth with sparse violet and magenta emphasis.
- Glass reserved for floating controls and temporary layers.
- Existing album artwork used as a dim, enlarged atmosphere.
- One fast, restrained motion language with reduced-motion equivalents.
- System typography, generous touch targets, and legibility before effects.

## Colors

The palette pairs neutral smoked layers with a compact brand spectrum. Primary text is used for essential content, secondary text for supporting information, and disabled text only for genuinely unavailable states.

### Primary

- **Crossed-Flow Violet:** The main brand accent and the basis of selected material fills.

### Secondary

- **Vibe Magenta:** Active navigation, focus emphasis, and sparing high-energy detail.

### Neutral

- **Deep Stage:** The default screen background; AMOLED black remains a prepared alternate role.
- **Smoked Acrylic:** The translucent and strong surface roles for floating hierarchy.
- **Soft White / Cool Gray:** Primary and secondary text roles chosen to remain readable above artwork and material layers.
- **Ghost Border:** A low-opacity edge that separates glass without making every surface look outlined.

**The Accent Rarity Rule.** Violet and magenta identify state and energy; they are not general-purpose decoration or full-screen glow.

**The Contrast Rule.** Never use the disabled text role for readable instructions, metadata, placeholders, or empty-state guidance.

## Typography

**Display Font:** System
**Body Font:** System

**Character:** The native system face keeps the music, artwork, and controls visually dominant. Weight and scale establish hierarchy without decorative fonts or excessive variants.

### Hierarchy

- **Display:** Bold, used for primary screen identity and prominent greetings.
- **Title:** Bold, used for track, playlist, and hero titles.
- **Section:** Semibold, used for scan-friendly content groups.
- **Body:** Regular, used for descriptions and primary supporting copy.
- **Caption:** Medium, used for metadata, source labels, and compact controls.

**The Five-Role Rule.** Reuse display, title, section, body, and caption roles before introducing a one-off text size.

## Layout

Spacing follows a 4/8/16/24/32/48/64 rhythm. Compact Android layouts use the existing four-destination bottom navigation and account for system insets; scroll content leaves clearance for both the mini-player and tab bar. The navigation structure, system Back behavior, deep links, and saved route behavior are functional constraints, not styling opportunities.

Interactive controls target at least 48 by 48 density-independent pixels. Dense music rows may look compact, but their hit areas must remain accessible. New layouts should keep essential actions reachable with font scaling and should not assume a fixed navigation-bar height.

## Elevation & Depth

Depth is primarily tonal: elevated black, raised surfaces, translucent smoked layers, a hairline glass edge, and strong dimming above artwork. Ambient and floating shadows are reserved for surfaces that physically sit above content, such as the mini-player; ordinary rows and cards do not receive large shadows.

Glass is progressive enhancement. `GlassSurface` uses native dark blur where the implementation considers it reliable and an intentionally designed translucent solid material on Android. The fallback keeps the same border, tone, radius, and hierarchy; Android API 31 or newer is never required for the visual system to make sense.

**The Hierarchy-Only Glass Rule.** Use glass for bottom navigation, the mini-player, modal sheets, context surfaces, and selected floating controls—not every content card.

## Shapes

Corners are gently rounded rather than bubbly: small controls use the small radius, cards and the mini-player use the medium radius, and sheets use the large radius on their top edge. Fully rounded geometry is reserved for pills, progress handles, and selected navigation indicators. Hairline borders provide separation without hard framing.

The production Vibe2X mark is immutable artwork. Its crossed-flow geometry must never be redrawn, simplified, reinterpreted, or replaced by a generated approximation.

## Components

### PressableScale

Interactive surfaces compress to 0.975 over the fast motion duration and return with the same easing. Reduced Motion removes the scale animation. Do not add bounce or spring behavior to routine controls.

### GlassSurface

The canonical material wrapper supports soft, strong, and floating strength. It combines a smoked fill, low-opacity border, clipped contents, and—only where reliable—background blur. Floating strength may add the established shadow vocabulary.

### LiquidSheet

Sheets use a strong glass material, dim scrim, large top corners, a subtle drag indicator, safe-area-aware bottom padding, keyboard offset support, and an accessible close target. Sheet/modal motion uses the 300 ms duration where controlled by the component stack.

### LiquidTabBar

The bottom bar is a strong floating material with a restrained, shape-based selected indicator so state is not communicated by color alone. Indicator changes use the standard 220 ms timing and honor Reduced Motion.

### Mini-player

The mini-player is the persistent bridge to Now Playing: artwork, title, artist, playback source, play/pause, optional next, and an isolated progress subscription. Opening Now Playing uses the stable native-stack fade-from-bottom transition and preserves artwork continuity; it is not a shared-element effect. The visual component only subscribes to existing playback state and never owns it.

### ArtworkAtmosphere

Now Playing and playlist heroes may place the current artwork in a memoized, enlarged, dimmed layer over the normal background, then add the fixed Vibe2X gradient and scrim. Controls render independently of image availability. No live color extraction is performed. Blur is disabled on lower-cost Android paths below API 31 while dimming and the brand fallback remain intact.

### LaunchExperience

The launch overlay uses two clipped copies of the real production logo asset, translated from opposing directions so the exact mark settles intact. It runs above normal state loading and exits only when both application readiness and its minimum presentation time are satisfied; it does not delay provider or persistence initialization. A versioned local flag selects the 1400 ms first-launch treatment or 520 ms repeat treatment. Reduced Motion uses a 120 ms minimum and removes transform/fade duration. The overlay blocks interaction and presents a startup accessibility label while visible.

**The No-Playback-Ownership Rule.** Visual components subscribe to existing hooks and services. They must not duplicate queue, progress, playback, liked-state, history, playlist, provider, or stream-resolution logic.

## Do's and Don'ts

### Do:

- **Do** use semantic roles from `src/constants/theme.ts`; retain compatibility aliases only while older surfaces migrate.
- **Do** use fast (150 ms), standard (220 ms), sheet (300 ms), and launch timings consistently, with the established easing curves.
- **Do** treat blur, artwork loading, and animation as optional layers over a complete, readable solid interface.
- **Do** use `PressableScale`, `GlassSurface`, `LiquidSheet`, `SectionHeader`, and the established navigation/player primitives before creating a parallel pattern.
- **Do** preserve safe areas, font scaling, screen-reader labels, shape-based selected states, and 48 dp touch targets.
- **Do** keep artwork processing memoized or platform-cached and avoid continuously running animation or image work during playback.

### Don't:

- **Don't** copy Spotify, Apple Music, YouTube Music, or another app's screen composition.
- **Don't** add particles, looping gradients, excessive bloom, fake 3D, or glass to every card.
- **Don't** make controls depend on remote artwork, blur support, animation completion, or color extraction.
- **Don't** mutate the production logo geometry for launch animation or any other visual treatment.
- **Don't** move business logic into UI components or alter playback/provider architecture for presentation.
- **Don't** claim device-level appearance, performance, or accessibility verification without an emulator or physical-device run.
