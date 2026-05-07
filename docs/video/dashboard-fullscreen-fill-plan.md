# Dashboard Fullscreen Fill Plan

Status: implementation planned.

## Problem

Dashboard tap-to-fullscreen playback can show black bars at the top and bottom of the custom fullscreen player. The likely source is fullscreen playback using the user's persisted `fit` preference or an inline display mode that preserves the entire frame rather than filling the available mobile safe area.

## Goal

When a dashboard video is tapped into fullscreen, default to the most immersive safe-area fill: use cover/fill mode so the video occupies the maximum visible fullscreen area. The existing fullscreen fit toggle should remain available so a user can switch back to letterboxed fit if they want to inspect the entire frame.

## Implementation

- When the dashboard tap-to-fullscreen gesture runs, set the player's fullscreen fit mode to `cover` before requesting pseudo-fullscreen.
- Keep the existing fullscreen fit toggle unchanged.
- Keep non-dashboard/session-detail behavior unchanged; only the dashboard tap-to-fullscreen path should force the initial cover mode.
- Validate with `npm run check`.
