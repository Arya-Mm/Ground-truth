// Copyright 2026 Specs Inc.
// Owns: gas-ring proximity state (hand tip vs. bucket vs. the gas tolerance ring,
// XZ-only per spec) and the resulting ring color / pulse / warning label / one-shot
// alarm. Does NOT own the ring's geometry (GroundTruthCorridorController) or the
// APPROACH->POTHOLE transition itself (GroundTruthStateMachine owns transitions; this
// controller only reports the hand-entered-ring edge via onHandEnteredRingOnce).

import { HandInputData } from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { makeWorldText } from "./GroundTruthGeometryUtils";
import { GroundTruthCorridorController } from "./GroundTruthCorridorController";

const COLOR_SAFE = new vec4(0.15, 0.85, 0.25, 1.0); // green
const COLOR_HAND = new vec4(1.0, 0.65, 0.0, 1.0); // amber
const COLOR_DANGER = new vec4(0.95, 0.1, 0.1, 1.0); // red

@component
export class GroundTruthRingProximityController extends BaseScriptComponent {
    @ui.separator
    @ui.label('<span style="color: #60A5FA;">GroundTruthRingProximityController - gas-only hand/bucket-vs-ring state</span>')
    @ui.separator
    @ui.group_start("References")
    @input
    @hint("The Gas corridor/ring this controller drives.")
    gasCorridor!: GroundTruthCorridorController;

    @input
    @hint("The grabbable excavator-bucket SceneObject (the 'machine tool').")
    bucket!: SceneObject;

    @input
    @hint("Authored ground anchor used to parent this controller's own status label.")
    groundRoot!: SceneObject;
    @ui.group_end
    @ui.group_start("Settings")
    @input
    @hint("Play this one-shot warning sound when the bucket first enters the gas tolerance ring.")
    warningSfx!: AudioComponent;
    @ui.group_end

    public onHandEnteredRingOnce: Event<void> = new Event<void>();

    private handEnteredRingOnce: boolean = false;
    private bucketWasInRingLastFrame: boolean = false;
    private handInRingLastFrame: boolean = false;
    private statusLabel: SceneObject | null = null;
    private active: boolean = false;

    onAwake() {
        if (!this.gasCorridor || !this.bucket || !this.groundRoot) {
            print("GroundTruthRingProximityController: required @input not wired.");
            return;
        }
        if (this.warningSfx) {
            this.warningSfx.playbackMode = Audio.PlaybackMode.LowLatency;
        }
        this.statusLabel = makeWorldText(this.groundRoot, "Gas_StatusLabel", "", 5.5, new vec4(1, 1, 1, 1), new vec3(0, 32, -200));
        this.statusLabel.enabled = false;
        this.createEvent("UpdateEvent").bind(() => this.update());
    }

    // StateMachine calls this once APPROACH begins (corridors already built).
    setActive(active: boolean): void {
        this.active = active;
        if (this.statusLabel) this.statusLabel.enabled = false;
    }

    reset(): void {
        this.handEnteredRingOnce = false;
        this.bucketWasInRingLastFrame = false;
    }

    isHandInRing(): boolean {
        return this.handInRingLastFrame;
    }

    private update(): void {
        if (!this.active) return;

        const ringPos = this.gasCorridor.getRingWorldPosition();
        const ringRadius = this.gasCorridor.getToleranceCm();
        const bucketPos = this.bucket.getTransform().getWorldPosition();
        const bucketInRing = horizontalDist(bucketPos, ringPos) <= ringRadius;

        const hand = HandInputData.getInstance().getHand("right");
        let handInRing = false;
        if (hand.isTracked()) {
            const handPos = hand.indexTip.position;
            handInRing = horizontalDist(handPos, ringPos) <= ringRadius;
        }
        this.handInRingLastFrame = handInRing;

        if (bucketInRing) {
            this.gasCorridor.setRingColor(COLOR_DANGER, true);
            this.showLabel("MACHINE IN TOLERANCE ZONE");
            if (!this.bucketWasInRingLastFrame && this.warningSfx) {
                this.warningSfx.play(1);
            }
        } else if (handInRing) {
            this.gasCorridor.setRingColor(COLOR_HAND, false);
            this.showLabel("HAND DIG OK");
        } else {
            this.gasCorridor.setRingColor(COLOR_SAFE, false);
            this.hideLabel();
        }
        this.bucketWasInRingLastFrame = bucketInRing;

        if (handInRing && !this.handEnteredRingOnce) {
            this.handEnteredRingOnce = true;
            this.onHandEnteredRingOnce.invoke();
        }
    }

    private showLabel(text: string): void {
        if (!this.statusLabel) return;
        this.statusLabel.enabled = true;
        const t = this.statusLabel.getComponent("Component.Text") as Text;
        if (t) t.text = text;
    }

    private hideLabel(): void {
        if (this.statusLabel) this.statusLabel.enabled = false;
    }
}

function horizontalDist(a: vec3, b: vec3): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}
