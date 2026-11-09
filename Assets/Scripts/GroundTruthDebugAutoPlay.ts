// TEMP DEBUG SCRIPT -- not part of the real experience. Hand/pinch input is unavailable
// in this Lens Studio session, so this drives the full state sequence on a timer instead,
// calling the exact same functions a real hand-in-ring / stroke / pinch would call --
// purely for recording a demo video. Safe to delete once real input works or after
// recording: remove this SceneObject from the scene and this file from Assets/Scripts.
import { GroundTruthRingProximityController } from "./GroundTruthRingProximityController";
import { GroundTruthPotholeController } from "./GroundTruthPotholeController";
import { GroundTruthSnapAnimationController } from "./GroundTruthSnapAnimationController";
import { GroundTruthNextCrewController } from "./GroundTruthNextCrewController";

@component
export class GroundTruthDebugAutoPlay extends BaseScriptComponent {
    @ui.separator
    @ui.label('<span style="color: #F87171;">TEMP DEBUG: auto-plays the whole loop on a timer. Delete after recording.</span>')
    @ui.separator
    @input
    ringProximity!: GroundTruthRingProximityController;
    @input
    pothole!: GroundTruthPotholeController;
    @input
    snapAnim!: GroundTruthSnapAnimationController;
    @input
    nextCrew!: GroundTruthNextCrewController;

    @input
    @hint("Seconds after Lens start before forcing hand-into-ring (must be longer than the ACQUIRE scan-sweep).")
    startDelaySec: number = 4.5;

    @input
    @hint("Seconds between each forced dig stroke.")
    strokeIntervalSec: number = 0.45;

    @input
    @hint("Seconds to wait after the hole completes before forcing the Confirm-exposed pinch (lets the pipe reveal be seen).")
    verifyDelaySec: number = 1.8;

    @input
    @hint("Seconds to wait after the snap animation before forcing Next-crew-arrives (lets the arrow/stamp be seen).")
    nextCrewDelaySec: number = 3.2;

    private elapsed: number = 0;
    private phase: "WAIT_START" | "STROKING" | "WAIT_VERIFY" | "WAIT_NEXTCREW" | "DONE" = "WAIT_START";
    private strokeTimer: number = 0;
    private potholeDone: boolean = false;

    onAwake() {
        if (!this.ringProximity || !this.pothole || !this.snapAnim || !this.nextCrew) {
            print("GroundTruthDebugAutoPlay: required @input not wired.");
            return;
        }
        this.createEvent("OnStartEvent").bind(() => {
            this.pothole.onPotholeComplete.add(() => {
                this.potholeDone = true;
            });
            this.createEvent("UpdateEvent").bind(() => this.update());
        });
    }

    private update(): void {
        const dt = getDeltaTime();
        this.elapsed += dt;

        if (this.phase === "WAIT_START") {
            if (this.elapsed >= this.startDelaySec) {
                print("GroundTruthDebugAutoPlay: forcing hand-into-ring -> POTHOLE");
                this.ringProximity.onHandEnteredRingOnce.invoke();
                this.phase = "STROKING";
                this.strokeTimer = 0;
            }
            return;
        }

        if (this.phase === "STROKING") {
            if (this.potholeDone) {
                print("GroundTruthDebugAutoPlay: pothole complete -> waiting to force VERIFY confirm");
                this.phase = "WAIT_VERIFY";
                this.elapsed = 0;
                return;
            }
            this.strokeTimer += dt;
            if (this.strokeTimer >= this.strokeIntervalSec) {
                this.strokeTimer = 0;
                this.pothole.debugForceStroke();
            }
            return;
        }

        if (this.phase === "WAIT_VERIFY") {
            if (this.elapsed >= this.verifyDelaySec) {
                print("GroundTruthDebugAutoPlay: forcing Confirm-exposed pinch");
                this.snapAnim.debugForceConfirm();
                this.phase = "WAIT_NEXTCREW";
                this.elapsed = 0;
            }
            return;
        }

        if (this.phase === "WAIT_NEXTCREW") {
            if (this.elapsed >= this.nextCrewDelaySec) {
                print("GroundTruthDebugAutoPlay: forcing Next-crew-arrives pinch");
                this.nextCrew.debugForceNextCrew();
                this.phase = "DONE";
            }
            return;
        }
    }
}
