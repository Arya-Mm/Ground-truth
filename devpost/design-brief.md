---
status: approved
---

# Design brief: GroundTruth

<!-- Filled in by plan-lens from the learner's interview. Use the learner's words. Mark any value they didn't choose as (default). -->

## The one spatial moment
Standing over a 4m x 3m dirt patch with painted locate marks (yellow gas, red electric, orange telecom), hand-digging a pothole toward the buried gas line while the ground itself shows a fuzzy uncertainty corridor sized to the real locate tolerance — not a fake precise line. When the pipe is exposed, one pinch collapses that corridor onto the true measured position and shows how far the original map was off.

## Why it belongs on glasses
- Uses: draws in the world (corridor sits at true depth under the marks, tolerance ring on the ground, depth gauge inside the hole) + leaves your body free (hands dig, the state advances on its own, only one pinch in the whole experience) + shares your view (recognition is mocked, as the hackathon organizers advise for Preview, standing in for the Lens having seen the painted marks)
- Why it's better than the phone or laptop version: a laptop map shows a precise-looking line on a screen in the truck. The crew's hands hold tools and their eyes are on the dirt — the warning has to be in the hole, not on a screen somewhere else, and uncertainty should look uncertain instead of fake-precise.

## Product or overlay
- Type: overlay — it responds to something real (the crew's painted locate marks and the buried pipe)
- What the real version would sense: spray-painted locate lines on the ground, plus locate-tolerance data per utility
- Stand-in for the preview: camera recognition doesn't work in Preview, so recognition is mocked — a scan-sweep plays over the patch once, then all three marks are treated as "already recognized" and their corridors appear. The true pipe position (0.7m offset from the mapped line) is a hard-coded "ground truth" revealed at VERIFY, standing in for a real exposed-pipe measurement.

## Where things live
- Where the user is looking during the main task: down at the dirt patch and the hole they're digging
- Utility corridor + tolerance ring: anchored on the ground, directly under/around its painted locate mark, at real depth (gas 0.9m, electric 0.6m, telecom 0.4m), width = 2x tolerance (0.5m each side, default)
- Corridor label ("Gas · ±0.5 m · ~0.9 m deep"): on the corridor itself, only visible within 2m (default) so distant corridors stay faint and out of the way
- Depth gauge: on the inside wall of the hole being dug
- "Confirm exposed" pinch target: directly on the revealed true pipe, >=6cm
- "Next crew arrives" pinch target: at the edge of the dirt patch

## Hands and input
- Scoop to dig: a down-then-up stroke of the hand tip while inside the gas ring deepens the hole 0.1m per stroke (no pinch needed — hands stay free for the dig itself)
- Grab: the excavator-bucket prop is grabbable (SIK drag) as the "machine" tool, to test the danger-zone warning
- Pinch: "Confirm exposed" on the true pipe (the only state-advancing pinch until the loop point)
- Pinch: "Next crew arrives" at the patch edge, to reset with the logged correction
- Targets are big (>=6cm) and highlight/pulse on proximity or danger.
- Voice: none.

## When things show
- Each corridor: faint/low-opacity by default, becomes its full-detail labeled state within 2m of the user (default threshold)
- Tolerance ring: green (idle) / amber (hand inside) / red + pulse + warning beep (bucket/machine inside)
- Depth gauge: shows only while the gas pothole is being dug
- Offset arrow + "Map was off by 0.7 m": appears only after the VERIFY pinch, during the snap animation
- "As-built logged" stamp + clearance envelope: appears only after the snap completes, at LOG
- If something needs attention out of view: not needed — the whole experience stays within a few meters of one patch, nothing is ever behind the user

## Done criteria
Each one can be checked in Lens Studio's preview.
1. On Lens start, a scan-sweep crosses the patch, then all three corridors (gas/electric/telecom) appear at the correct depth, width, and APWA color, each with a tolerance ring.
2. Moving the hand into the gas ring turns it amber with "HAND DIG OK"; grabbing the bucket into the ring turns it red, pulsing, with a warning beep and "MACHINE IN TOLERANCE ZONE".
3. Scooping inside the gas ring deepens the hole and counts the in-hole depth gauge down toward 0.9m.
4. At full depth, the true pipe appears offset from the mapped line; pinching "Confirm exposed" plays a smooth ~1.2s snap where the corridor narrows, moves onto the true pipe, and turns solid, followed by an arrow labeled "Map was off by 0.7 m".
5. Pinching "Next crew arrives" resets the patch and rebuilds the gas corridor tighter and shifted onto the corrected position, with no explanation text needed.

## Out of scope
- Trainee/score-card mode
- Real camera recognition of painted marks (mocked per Preview limits)
- Electric/telecom corridors getting their own dig/verify flow (they exist, are labeled, and proximity-fade, but only gas has the full dig-to-snap sequence)

## Risks and open questions
- Outdoor locate positioning isn't centimeter-accurate in reality. Kept deliberately: the whole design point is drawing the corridor at real tolerance width instead of a fake-precise line, and the video says this plainly as an honest close rather than hiding it.
- Hand/bucket/pinch interactions are driven by mouse in Lens Studio's Interactive Preview (clicking acts as a pinch), not real hand tracking — SIK-based so the logic matches real hand input, but the felt quality of real hands is unproven until tried on-device.
- Automated LEAF scenario testing was attempted (a full state-machine playthrough scenario was written) but abandoned: the installed LEAF.lspkg 4.0.0 package has a type-checking bug in its own shipped ScenarioIndexDecorator.ts that breaks compilation for any project using `@scenariosIndex`, independent of anything in this Lens's own code. Verified manually in Preview instead.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.

## After the build: judge it
This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources
