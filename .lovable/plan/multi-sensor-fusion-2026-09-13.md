# Multi-Sensor Fusion

## Goal
Add a working **Multi-Sensor Fusion** module to Border Sentinel that correlates simulated observations from CCTV, radar, thermal, motion, drone, and environment sensors into unified targets. It will stop at correlation and identification; threat scoring remains outside this feature.

## What will be built
- Add a `/fusion` page with route-specific metadata and the existing Border Sentinel shell.
- Expand the shared navigation to include Multi-Sensor Simulation, Multi-Sensor Fusion, Threat Assessment, Incident History, and System Settings, with Fusion highlighted on this page.
- Add the fusion-specific header and six live sensor status cards.
- Build a technical terrain display with five sectors, border boundary, restricted zone, target markers, labels, and movement trails.
- Add a target legend using consistent human, animal, vehicle, drone, boundary, trail, and restricted-zone identifiers.
- Add a live Fused Targets panel and an Individual Sensor Inputs panel.
- Add tabbed raw sensor observations with timestamps for every sensor source.
- Add a clear processing flow from sensor collection through correlation and identification to “Ready for Threat Assessment.”
- Add start, pause, reset, auto/manual mode, and confidence-threshold controls.
- Add selectable target details and a “Send to Threat Assessment” action that packages the selected fused record without calculating a threat score.
- Add an academic-prototype note clarifying that the correlation formula is demonstrative, not operational.

## Live behavior
- Create a dedicated simulation hook and typed fusion model separate from the page UI.
- Update target positions, paths, timestamps, sensor observations, sensor agreement, and confidence on a timed loop.
- Periodically vary sensor agreement so targets can become confirmed or unconfirmed according to the selected threshold.
- Support target appearance/disappearance while keeping the selected target state safe.
- Keep an `ingest`-style boundary so future API or WebSocket data can replace the simulator without rebuilding the interface.

## Correlation model
- Match observations using target identity where available, then prototype similarity checks for sector/location, timestamp proximity, object type, direction, and speed.
- Calculate fusion confidence from weighted sensor confidence, independent sensor agreement, spatial/temporal consistency, and movement consistency.
- Display conflicting observations when correlation is uncertain.
- Never derive or display a final threat score.

## Verification
- Check the generated route and navigation link.
- Verify live movement, controls, tabs, target selection, threshold changes, and send action in the browser.
- Check desktop and the current narrow preview for overflow or overlapping text.
- Confirm the project builds cleanly and browser console/runtime logs remain clear.
