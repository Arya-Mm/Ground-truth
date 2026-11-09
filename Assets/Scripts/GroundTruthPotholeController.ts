// Copyright 2026 Specs Inc.
// Owns: the gas-only hand-dug pothole — scooping-stroke detection (down-then-up hand-tip
// motion while the hand is inside the gas ring), the growing hole cavity mesh, and the
// "X.X m to gas" depth gauge text. Does NOT own ring/bucket proximity (that's
// GroundTruthRingProximityController, queried via isHandInRing()) or what happens after
// full depth is reached (StateMachine owns the POTHOLE->VERIFY transition via
// onPotholeComplete).

import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { HandInputData } from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData";
import { makeMeshChild, makeUnlitMaterial, makeWorldText, getCylinderMesh } from "./GroundTruthGeometryUtils";
import { GroundTruthCorridorController } from "./GroundTruthCorridorController";
import { GroundTruthRingProximityController } from "./GroundTruthRingProximityController";

const DY_EPS_CM = 0.3; // per-frame vertical noise floor
const STROKE_DIP_THRESHOLD_CM = 3; // minimum down->up dip to count as one scoop
const STROKE_DEEPEN_CM = 10; // 0.1 m per completed stroke

@component
export class GroundTruthPotholeController extends BaseScriptComponent {
    @ui.separator
    @ui.label('<span style="color: #60A5FA;">GroundTruthPotholeController - gas-only stroke-counted hand dig</span>')
    @ui.separator
    @ui.group_start("References")
    @input
    gasCorridor!: GroundTruthCorridorController;
    @input
    ringProximity!: GroundTruthRingProximityController;
    @input
    groundRoot!: SceneObject;
    @ui.group_end
    @ui.group_start("Settings")
    @input
    @widget(new SliderWidget(1, 20, 0.5))
    @hint("Minimum vertical dip (cm) of the hand tip, down then up, to count as one completed scoop stroke.")
    strokeDipThresholdCm: number = STROKE_DIP_THRESHOLD_CM;

    @input
    @widget(new SliderWidget(2, 30, 1))
    @hint("Hole depth added per completed stroke, in cm (default 0.1 m).")
    strokeDeepenCm: number = STROKE_DEEPEN_CM;
    @ui.group_end

    public onPotholeComplete: Event<void> = new Event<void>();

    private active: boolean = false;
    private depthAccumCm: number = 0;
    private prevHandY: number | null = null;
    private goingDown: boolean = false;
    private peakY: number = 0;
    private troughY: number = 0;

    private holeObj: SceneObject | null = null;
    private gaugeObj: SceneObject | null = null;
    private unsubscribePinch: (() => void) | null = null;

    onAwake() {
        if (!this.gasCorridor || !this.ringProximity || !this.groundRoot) {
            print("GroundTruthPotholeController: required @input not wired.");
            return;
        }
        this.createEvent("UpdateEvent").bind(() => this.update());
    }

    // StateMachine calls this entering POTHOLE.
    startDigging(): void {
        this.active = true;
        this.depthAccumCm = 0;
        this.prevHandY = null;
        this.goingDown = false;

        // Real down-up hand-tip strokes are the primary input (works on-device). A pinch
        // while the hand is in the ring is also accepted as one stroke -- desktop Preview's
        // mouse-driven hand mostly rides along whatever surface it's pointed at, so its
        // world-Y barely moves even while actively dragging, and the dip-based detection
        // above can't reliably fire from mouse input alone. Pinch is a clean, unambiguous
        // signal either way.
        const hand = HandInputData.getInstance().getHand("right");
        this.unsubscribePinch = hand.onPinchDown.add(() => {
            if (this.active && this.ringProximity.isHandInRing()) this.onStrokeCompleted();
        });

        const ringPos = this.gasCorridor.getRingWorldPosition();
        const diameterCm = 2 * this.gasCorridor.getToleranceCm();
        const mat = makeUnlitMaterial(new vec4(0.08, 0.06, 0.04, 1.0), false);
        this.holeObj = makeMeshChild(this.groundRoot, "Gas_Hole", getCylinderMesh(), mat);
        this.holeObj.getTransform().setWorldPosition(new vec3(ringPos.x, ringPos.y - 0.05, ringPos.z));
        this.holeObj.getTransform().setLocalScale(new vec3(diameterCm, 0.1, diameterCm));

        this.gaugeObj = makeWorldText(
            this.groundRoot,
            "Gas_DepthGauge",
            "0.9 m to gas",
            4.5,
            new vec4(1, 1, 1, 1),
            new vec3(0, 0, 0) // overwritten below with a world position via setWorldPosition
        );
        this.gaugeObj.getTransform().setWorldPosition(new vec3(ringPos.x + this.gasCorridor.getToleranceCm() * 0.6, ringPos.y, ringPos.z));
    }

    reset(): void {
        this.active = false;
        this.depthAccumCm = 0;
        this.prevHandY = null;
        this.goingDown = false;
        if (this.unsubscribePinch) {
            this.unsubscribePinch();
            this.unsubscribePinch = null;
        }
        if (this.holeObj) {
            this.holeObj.destroy();
            this.holeObj = null;
        }
        if (this.gaugeObj) {
            this.gaugeObj.destroy();
            this.gaugeObj = null;
        }
    }

    private update(): void {
        if (!this.active || !this.holeObj) return;
        if (!this.ringProximity.isHandInRing()) {
            this.prevHandY = null; // require a fresh down-stroke once hand re-enters
            return;
        }

        const hand = HandInputData.getInstance().getHand("right");
        if (!hand.isTracked()) return;
        const handY = hand.indexTip.position.y;

        if (this.prevHandY === null) {
            this.prevHandY = handY;
            return;
        }
        const dy = handY - this.prevHandY;
        if (dy < -DY_EPS_CM) {
            if (!this.goingDown) {
                this.peakY = this.prevHandY;
                this.goingDown = true;
                this.troughY = handY;
            } else if (handY < this.troughY) {
                this.troughY = handY;
            }
        } else if (dy > DY_EPS_CM) {
            if (this.goingDown) {
                const dip = this.peakY - this.troughY;
                if (dip >= this.strokeDipThresholdCm) {
                    this.onStrokeCompleted();
                }
                this.goingDown = false;
            }
        }
        this.prevHandY = handY;
    }

    // TEMP DEBUG: forces one dig stroke, same path a real down-up hand stroke takes.
    // Used only by GroundTruthDebugAutoPlay while hand input is unavailable this session.
    debugForceStroke(): void {
        this.onStrokeCompleted();
    }

    private onStrokeCompleted(): void {
        const depthCm = this.gasCorridor.depthCm;
        this.depthAccumCm = Math.min(this.depthAccumCm + this.strokeDeepenCm, depthCm);

        if (this.holeObj) {
            const diameterCm = 2 * this.gasCorridor.getToleranceCm();
            const ringPos = this.gasCorridor.getRingWorldPosition();
            this.holeObj.getTransform().setLocalScale(new vec3(diameterCm, Math.max(0.1, this.depthAccumCm), diameterCm));
            this.holeObj.getTransform().setWorldPosition(new vec3(ringPos.x, ringPos.y - this.depthAccumCm / 2, ringPos.z));
        }
        if (this.gaugeObj) {
            const remainingM = (depthCm - this.depthAccumCm) / 100;
            const t = this.gaugeObj.getComponent("Component.Text") as Text;
            if (t) t.text = remainingM.toFixed(1) + " m to gas";
            const ringPos = this.gasCorridor.getRingWorldPosition();
            this.gaugeObj.getTransform().setWorldPosition(
                new vec3(ringPos.x + this.gasCorridor.getToleranceCm() * 0.6, ringPos.y - this.depthAccumCm / 2, ringPos.z)
            );
        }

        if (this.depthAccumCm >= depthCm) {
            this.active = false;
            this.onPotholeComplete.invoke();
        }
    }
}
