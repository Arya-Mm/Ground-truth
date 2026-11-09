// Copyright 2026 Specs Inc.
// Owns: VERIFY — revealing the true (mocked ground-truth) pipe inside the finished
// pothole, the single "Confirm exposed" pinch target, the 1.2s snap tween (corridor
// width/position/opacity collapsing onto the true pipe), and the old-line -> true-line
// offset arrow + label. Does NOT own LOG's stamp/envelope/correction-storage/next-crew
// target (GroundTruthNextCrewController) or state transitions (GroundTruthStateMachine);
// it only reports completion via onVerifyComplete.

import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import animate from "SpectaclesInteractionKit.lspkg/Utils/animate";
import {
    makeMeshChild,
    makeUnlitMaterial,
    makeWorldText,
    makePinchTarget,
    getCylinderMesh,
    getBoxMesh,
    getConeMesh,
} from "./GroundTruthGeometryUtils";
import { GroundTruthCorridorController } from "./GroundTruthCorridorController";
import { GroundTruthPotholeController } from "./GroundTruthPotholeController";

export interface VerifyResult {
    pipeWorldPos: vec3;
    offsetCm: number;
    newToleranceCm: number;
}

@component
export class GroundTruthSnapAnimationController extends BaseScriptComponent {
    @ui.separator
    @ui.label('<span style="color: #60A5FA;">GroundTruthSnapAnimationController - VERIFY: pipe reveal + snap tween + offset arrow</span>')
    @ui.separator
    @ui.group_start("References")
    @input
    gasCorridor!: GroundTruthCorridorController;
    @input
    pothole!: GroundTruthPotholeController;
    @input
    groundRoot!: SceneObject;
    @ui.group_end
    @ui.group_start("Settings")
    @input
    @widget(new SliderWidget(10, 150, 1))
    @hint("Mocked ground-truth: how far sideways (cm) the true pipe sits from the originally mapped locate line. This is the demo's reveal.")
    correctionOffsetCm: number = 70;

    @input
    @widget(new SliderWidget(2, 30, 1))
    @hint("True pipe diameter, cm. The corridor collapses to this width when confirmed.")
    pipeDiameterCm: number = 10;

    @input
    @widget(new SliderWidget(5, 50, 1))
    @hint("Narrowed tolerance (radius, cm) stored for the next crew's corrected corridor/ring.")
    correctedToleranceCm: number = 15;

    @input
    @widget(new SliderWidget(0.3, 3, 0.1))
    @hint("Duration of the snap animation (confirm -> corridor collapses onto the true pipe), seconds.")
    tweenDurationSec: number = 1.2;
    @ui.group_end

    public onVerifyComplete: Event<VerifyResult> = new Event<VerifyResult>();

    private pipeObj: SceneObject | null = null;
    private confirmTagObj: SceneObject | null = null;
    private confirmTagLabelObj: SceneObject | null = null;
    private arrowObjs: SceneObject[] = [];
    private arrowLabelObj: SceneObject | null = null;
    private confirmed: boolean = false;

    onAwake() {
        if (!this.gasCorridor || !this.pothole || !this.groundRoot) {
            print("GroundTruthSnapAnimationController: required @input not wired.");
            return;
        }
    }

    // StateMachine calls this entering VERIFY.
    startVerify(): void {
        this.confirmed = false;
        const depthCm = this.gasCorridor.depthCm;
        const ringPos = this.gasCorridor.getRingWorldPosition();
        // Anchor to the ORIGINAL mapped line (lineLocalZCm never moves), not the ring's
        // current Z — on a second+ NEXT_CREW loop the ring is already sitting at the prior
        // correction, and offsetting from it again would drift the "true pipe" further
        // every replay instead of landing at one fixed ground-truth position.
        const groundWorldZ = this.groundRoot.getTransform().getWorldPosition().z;
        const originalLineWorldZ = groundWorldZ + this.gasCorridor.lineLocalZCm;
        const pipeWorldPos = new vec3(ringPos.x, ringPos.y - depthCm, originalLineWorldZ + this.correctionOffsetCm);

        const pipeMat = makeUnlitMaterial(new vec4(0.95, 0.65, 0.05, 1.0), false);
        this.pipeObj = makeMeshChild(this.groundRoot, "Gas_TruePipe", getCylinderMesh(), pipeMat);
        this.pipeObj.getTransform().setLocalScale(new vec3(this.pipeDiameterCm, 2 * this.gasCorridor.lineHalfLengthCm, this.pipeDiameterCm));
        this.pipeObj.getTransform().setLocalRotation(quat.fromEulerAngles(0, 0, Math.PI / 2));
        this.pipeObj.getTransform().setWorldPosition(pipeWorldPos);

        const tagMat = makeUnlitMaterial(new vec4(0.1, 0.8, 1.0, 1.0), false);
        this.confirmTagObj = makeMeshChild(this.groundRoot, "Gas_ConfirmTag", getBoxMesh(), tagMat);
        this.confirmTagObj.getTransform().setLocalScale(new vec3(10, 10, 4));
        this.confirmTagObj.getTransform().setWorldPosition(new vec3(pipeWorldPos.x, pipeWorldPos.y + 8, pipeWorldPos.z));
        makePinchTarget(this.confirmTagObj, new vec3(10, 10, 10), () => this.onConfirmPinched(pipeWorldPos));

        // Label parented under groundRoot (unscaled), NOT the tag box — a child's local
        // position/size inherits the parent's scale, and the tag box is scaled (10,10,4).
        const confirmLabel = makeWorldText(this.groundRoot, "Gas_ConfirmTagLabel", "Confirm exposed", 3.5, new vec4(1, 1, 1, 1), new vec3(0, 0, 0));
        confirmLabel.getTransform().setWorldPosition(new vec3(pipeWorldPos.x, pipeWorldPos.y + 15, pipeWorldPos.z));
        this.confirmTagLabelObj = confirmLabel;
    }

    reset(): void {
        this.confirmed = false;
        if (this.pipeObj) {
            this.pipeObj.destroy();
            this.pipeObj = null;
        }
        if (this.confirmTagObj) {
            this.confirmTagObj.destroy();
            this.confirmTagObj = null;
        }
        if (this.confirmTagLabelObj) {
            this.confirmTagLabelObj.destroy();
            this.confirmTagLabelObj = null;
        }
        for (const o of this.arrowObjs) o.destroy();
        this.arrowObjs = [];
        if (this.arrowLabelObj) {
            this.arrowLabelObj.destroy();
            this.arrowLabelObj = null;
        }
    }

    // TEMP DEBUG: forces the same path a real "Confirm exposed" pinch takes. Used only
    // by GroundTruthDebugAutoPlay while hand/pinch input is unavailable in this session.
    debugForceConfirm(): void {
        if (!this.pipeObj) return;
        this.onConfirmPinched(this.pipeObj.getTransform().getWorldPosition());
    }

    private onConfirmPinched(pipeWorldPos: vec3): void {
        if (this.confirmed) return;
        this.confirmed = true;
        if (this.confirmTagObj) this.confirmTagObj.enabled = false;
        if (this.confirmTagLabelObj) this.confirmTagLabelObj.enabled = false;

        this.gasCorridor.setFadeEnabled(false);
        const startOffset = this.gasCorridor.getCurrentOffsetCm();
        const startTol = this.gasCorridor.getToleranceCm();
        const endOffset = this.correctionOffsetCm;
        const endTol = this.pipeDiameterCm / 2;

        animate({
            duration: this.tweenDurationSec,
            easing: "ease-out-quad",
            update: (t: number) => {
                this.gasCorridor.updateLive(t, startOffset, endOffset, startTol, endTol);
            },
            ended: () => {
                this.showOffsetArrow();
                this.onVerifyComplete.invoke({
                    pipeWorldPos: pipeWorldPos,
                    offsetCm: this.correctionOffsetCm,
                    newToleranceCm: this.correctedToleranceCm,
                });
            },
        });
    }

    private showOffsetArrow(): void {
        // Called after the snap tween, so the ring is already sitting AT the corrected/
        // true position — use it only for X/Y (never drift) and anchor the arrow's span to
        // the ORIGINAL mapped line's Z, same basis as startVerify()'s pipeWorldPos. Using
        // the post-tween ring Z here (as before) based the arrow off the pipe's own
        // location and shot it further past the pipe instead of spanning old-line -> pipe.
        const ringPos = this.gasCorridor.getRingWorldPosition();
        const groundWorldZ = this.groundRoot.getTransform().getWorldPosition().z;
        const originalLineWorldZ = groundWorldZ + this.gasCorridor.lineLocalZCm;

        const arrowMat = makeUnlitMaterial(new vec4(1, 1, 1, 1), false);
        const shaft = makeMeshChild(this.groundRoot, "OffsetArrow_Shaft", getBoxMesh(), arrowMat);
        shaft.getTransform().setLocalScale(new vec3(2, 1, this.correctionOffsetCm * 0.8));
        shaft.getTransform().setLocalRotation(quat.fromEulerAngles(0, Math.PI / 2, 0));
        shaft.getTransform().setWorldPosition(new vec3(ringPos.x, ringPos.y + 0.5, originalLineWorldZ + this.correctionOffsetCm * 0.4));

        const head = makeMeshChild(this.groundRoot, "OffsetArrow_Head", getConeMesh(), arrowMat);
        head.getTransform().setLocalScale(new vec3(6, 8, 6));
        head.getTransform().setLocalRotation(quat.fromEulerAngles(0, 0, Math.PI / 2));
        head.getTransform().setWorldPosition(new vec3(ringPos.x, ringPos.y + 0.5, originalLineWorldZ + this.correctionOffsetCm * 0.85));
        this.arrowObjs = [shaft, head];

        this.arrowLabelObj = makeWorldText(
            this.groundRoot,
            "OffsetArrow_Label",
            "Map was off by " + (this.correctionOffsetCm / 100).toFixed(1) + " m",
            5,
            new vec4(1, 1, 1, 1),
            new vec3(0, 0, 0)
        );
        this.arrowLabelObj.getTransform().setWorldPosition(new vec3(ringPos.x, ringPos.y + 14, originalLineWorldZ + this.correctionOffsetCm * 0.5));
    }
}
