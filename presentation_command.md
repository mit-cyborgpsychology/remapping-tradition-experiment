# Presentation mode commands

## How to present

1. Open the visualization and select **Presentation mode** in the top-left corner. The browser enters fullscreen and starts at the first `>>` step in `presentation_outline.md`.
2. Press **Right Arrow** to advance and **Left Arrow** to go back. Every press begins the requested step immediately from the scene's current state, even if the previous transition is still moving, so no step requires a second press. Backward navigation reconstructs the earlier step, including its view, countries, selected pose, and comparison.
3. Mouse and trackpad interaction remain available: drag to rotate, scroll to zoom, click a pose, and use the visible controls.
4. Press **Escape** to leave presentation mode and fullscreen. The presentation button is hidden while presenting.

When a comparison is active, a descriptive audience-facing title appears at the top of the presentation. It names the comparison scope and explains what matches are being shown, including comparisons activated manually while presenting.

## Editing the outline

- Start every step with `>>`.
- Put one step on each line.
- Chain commands in one step with `/`. Every command on that line begins as one coordinated transition; for example, showing Brunei and framing three countries happen together.
- Add a comment after `//`; comments are ignored.
- Square brackets `[]` and braces `{}` are accepted for command arguments.
- The outline is bundled into the app. Rebuild or restart the production preview after editing it.

## Commands

### Scene and display

- `>>Black screen` — show a completely black slide.
- `>>Opening` — replay the progressive opening scene.
- `>>View[BodyTransparent]` — show transparent human bodies.
- `>>View[DiagramOnly]` — show diagrams only.
- `>>View[BodyOnly]` — show the original body images.
- `>>View[BodyWithDiagram]` — show the combined image and diagram assets.
- `>>DiagramOverlay(50)` — set the transparent-body diagram overlay from `0` to `100` percent.
- `>>VerticalRotation(1)` — enable vertical pose rotation; use `0` to disable it.
- `>>VerticalRotationSpeed(120)` — set rotation speed in degrees per second.
- `>>MapRotation(1)` — orbit the camera so the entire map rotates while avatars remain fixed.
- `>>MapRotationSpeed(1)` — set the map-orbit speed; `1` produces a visible, steady rotation.
- `>>Duration(1)` — set the animation duration for the current step to one second without changing later steps.

### Pose selection and comparison

- `>>Goto[Philippines(08)]` — select and move the camera to one pose. A one-digit number such as `8` is automatically read as `08`.
- `>>Activate[Similar]` — show the closest poses across the full collection.
- `>>Activate[Different]` — show the most different poses across the full collection.
- `>>Activate[SimilarAllCountries]` — show one closest pose from every other country.
- `>>Activate[DifferentAllCountries]` — show one farthest pose from every other country.
- `>>Activate[SimilarSameCountries]` — show the closest poses within the selected country.
- `>>Activate[DifferentSameCountries]` — show the farthest poses within the selected country.
- `>>GotoHome` — close pose exploration and return to the complete pose space.

### Country filtering and camera framing

- `>>Hide[AllCountries]` — hide every country.
- `>>Hide[Thailand]` — hide one country.
- `>>Show[Thailand]` — add one country to the visible set.
- `>>Show[AllCountries]` or `>>Show{AllCountries}` — show the full collection.
- `>>Zoominto[Thailand][Indonesia]` — frame all currently visible poses from the listed countries.
- `>>Show[Brunei]/Zoominto[Thailand][Indonesia][Brunei]` — combine multiple commands in one step.

Rotation settings persist across steps. `MapRotation` controls the entire map independently from `VerticalRotation`, which only rotates individual avatars.

Country matching ignores capitalization, spaces, and underscores. `Brunei` is accepted as shorthand for `Brunei_Darussalam`.

All four display styles are preloaded before the interface becomes available. During presentation mode, `View[...]` changes crossfade each pose directly between cached styles without covering the scene or fading to black. Each pose crossfades for 0.5 seconds, with staggered delays moving from the center of the current view outward. Country `Show[...]` and `Hide[...]` steps fade poses in or out, and `Show[...]` steps display an audience-facing country title and description. `GotoHome` returns to the same camera position and target reached at the end of the opening scene without showing a presentation title.
