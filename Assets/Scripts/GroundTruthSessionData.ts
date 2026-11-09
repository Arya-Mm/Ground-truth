// Copyright 2026 Specs Inc.
// Owns: in-session correction memory (true pipe offset + narrowed tolerance) captured in
// LOG and replayed by NEXT_CREW. Plain static data holder, NOT a @component — no scene
// access, no lifecycle. Lives only for the current Lens session (no persistence, per spec).

export class GroundTruthSessionData {
    static hasCorrection: boolean = false;
    // Signed lateral (Z) offset in cm of the true pipe from the originally mapped locate line.
    static correctedOffsetCm: number = 0;
    // Narrowed tolerance (radius, cm) applied to the gas corridor/ring after correction.
    static correctedToleranceCm: number = 15; // 0.15 m
}
