// Copyright 2026 Specs Inc.
// Owns: the ACQUIRE -> APPROACH -> POTHOLE -> VERIFY -> LOG -> NEXT_CREW state enum and
// all transitions between states. Dispatches to the per-feature controllers via their
// public methods/events — does NOT build geometry, detect gestures, or touch materials
// itself (those live in the controller it dispatches to). Attached to a SceneObject
// high in the hierarchy so it initializes before the controllers it drives.

import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { makeMeshChild, makeUnlitMaterial, getBoxMesh } from "./GroundTruthGeometryUtils";
import { GroundTruthCorridorController } from "./GroundTruthCorridorController";
import { GroundTruthRingProximityController } from "./GroundTruthRingProximityController";
import { GroundTruthPotholeController } from "./GroundTruthPotholeController";
import { GroundTruthSnapAnimationController } from "./GroundTruthSnapAnimationController";
import { GroundTruthNextCrewController } from "./GroundTruthNextCrewController";
import type { VerifyResult } from "./GroundTruthSnapAnimationController";

type GroundTruthState = "ACQUIRE" | "APPROACH" | "POTHOLE" | "VERIFY" | "LOG" | "NEXT_CREW";

@component
export class GroundTruthStateMachine extends BaseScriptComponent {
    @ui.separator
    @ui.label('<span style="color: #60A5FA;">GroundTruthStateMachine - ACQUIRE/APPROACH/POTHOLE/VERIFY/LOG/NEXT_CREW</span>')
    @ui.separator
    @ui.group_start("References")
    @input
    gasCorridor!: GroundTruthCorridorController;
    @input
    electricCorridor!: GroundTruthCorridorController;
    @input
    telecomCorridor!: GroundTruthCorridorController;
    @input
    ringProximity!: GroundTruthRingProximityController;
    @input
    pothole!: GroundTruthPotholeController;
    @input
    snapAnim!: GroundTruthSnapAnimationController;
    @input
    nextCrew!: GroundTruthNextCrewController;
    @input
    groundRoot!: SceneObject;
    @ui.group_end
    @ui.group_start("Settings")
    @input
    @widget(new SliderWidget(0.5, 6, 0.1))
    @hint("Duration of the one-time ACQUIRE scan-sweep, seconds.")
    sweepDurationSec: number = 2.5;

    @input
    @widget(new SliderWidget(-500, 500, 1))
    @hint("Local Z (relative to groundRoot) the sweep starts at — the near edge of the dirt patch.")
    sweepStartLocalZCm: number = -150;

    @input
    @widget(new SliderWidget(-500, 500, 1))
    @hint("Local Z (relative to groundRoot) the sweep ends at — the far edge of the dirt patch.")
    sweepEndLocalZCm: number = -450;

    @input
    @hint("Prints every state transition to the console. Debug-only; no effect on behavior.")
    debugState: boolean = false;
    @ui.group_end

    private state: GroundTruthState = "ACQUIRE";
    private sweepObj: SceneObject | null = null;
    private sweepElapsed: number = 0;
    private sweeping: boolean = false;

    onAwake() {
        if (
            !this.gasCorridor ||
            !this.electricCorridor ||
            !this.telecomCorridor ||
            !this.ringProximity ||
            !this.pothole ||
            !this.snapAnim ||
            !this.nextCrew ||
            !this.groundRoot
        ) {
            print("GroundTruthStateMachine: required @input not wired. Check bootstrap Phase B.");
            return;
        }

        // Subscribing here (in onAwake) is unsafe: GroundTruthControllers sits lower in
        // the hierarchy than this object, so its components' public Event fields (field
        // initializers run as part of each component's own onAwake-adjacent construction)
        // are not guaranteed to exist yet. OnStartEvent fires only after every onAwake in
        // the scene has completed — same rule the SIK primer uses for Interactable events.
        this.createEvent("OnStartEvent").bind(() => {
            this.ringProximity.onHandEnteredRingOnce.add(() => this.transitionTo("POTHOLE"));
            this.pothole.onPotholeComplete.add(() => this.transitionTo("VERIFY"));
            this.snapAnim.onVerifyComplete.add((result: VerifyResult) => {
                this.transitionTo("LOG");
                this.nextCrew.startLog(result);
            });
            this.nextCrew.onNextCrewPinched.add(() => {
                this.ringProximity.reset();
                this.pothole.reset();
                this.snapAnim.reset();
                this.transitionTo("APPROACH");
            });
            this.startAcquire();
        });
        this.createEvent("UpdateEvent").bind(() => this.updateSweep());
    }

    private transitionTo(next: GroundTruthState): void {
        if (this.debugState) print("GroundTruth state: " + this.state + " -> " + next);
        this.state = next;
        if (next === "APPROACH") {
            this.ringProximity.setActive(true);
        } else if (next === "POTHOLE") {
            this.ringProximity.setActive(true); // stays active — pothole depends on isHandInRing()
            this.pothole.startDigging();
        } else if (next === "VERIFY") {
            this.snapAnim.startVerify();
        }
    }

    private startAcquire(): void {
        this.state = "ACQUIRE";
        this.sweepElapsed = 0;
        this.sweeping = true;
        const mat = makeUnlitMaterial(new vec4(0.3, 1.0, 1.0, 0.8), true);
        this.sweepObj = makeMeshChild(this.groundRoot, "ScanSweep", getBoxMesh(), mat);
        this.sweepObj.getTransform().setLocalScale(new vec3(410, 1.0, 4));
        this.sweepObj.getTransform().setLocalPosition(new vec3(0, 2, this.sweepStartLocalZCm));
    }

    private updateSweep(): void {
        if (!this.sweeping || !this.sweepObj) return;
        this.sweepElapsed += getDeltaTime();
        const t = Math.min(1, this.sweepElapsed / this.sweepDurationSec);
        const z = this.sweepStartLocalZCm + (this.sweepEndLocalZCm - this.sweepStartLocalZCm) * t;
        this.sweepObj.getTransform().setLocalPosition(new vec3(0, 2, z));
        if (t >= 1) {
            this.sweeping = false;
            this.sweepObj.destroy();
            this.sweepObj = null;
            this.onSweepComplete();
        }
    }

    private onSweepComplete(): void {
        this.gasCorridor.build(0, this.gasCorridor.toleranceCm);
        this.electricCorridor.build(0, this.electricCorridor.toleranceCm);
        this.telecomCorridor.build(0, this.telecomCorridor.toleranceCm);
        this.nextCrew.captureDefaults();
        this.transitionTo("APPROACH");
    }
}
