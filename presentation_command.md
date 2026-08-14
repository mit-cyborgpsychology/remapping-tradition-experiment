# Presentation mode commands

## How to present

1. Open the visualization and select **Presentation mode** in the top-left corner. The browser enters fullscreen and starts at the first `>>` step in `presentation_outline.md`.
2. Press **Right Arrow** to advance and **Left Arrow** to go back. Backward navigation reconstructs the earlier step, including its view, countries, selected pose, and comparison.
3. Mouse and trackpad interaction remain available: drag to rotate, scroll to zoom, click a pose, and use the visible controls.
4. Select the top-left button again, or press **Escape**, to leave presentation mode and fullscreen.

## Editing the outline

- Start every step with `>>`.
- Put one step on each line.
- Chain commands in one step with `/`.
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

Country matching ignores capitalization, spaces, and underscores. `Brunei` is accepted as shorthand for `Brunei_Darussalam`.
