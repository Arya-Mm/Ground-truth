// Copyright 2026 Specs Inc.
// Owns: LOG (the "As-built logged" stamp, the safe-clearance envelope around the true
// pipe, writing the correction into GroundTruthSessionData, and the "Next crew arrives"
// pinch target) and NEXT_CREW's reset-with-correction loop (rebuilding Gas tighter/
// shifted while resetting Electric/Telecom to their original state). Does NOT own
// VERIFY's reveal/tween (GroundTruthSnapAnimationController) or the state machine's
// transition bookkeeping — it reports completion via onNextCrewPinched.

import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { makeMeshChild, makeUnlitMaterial, makeWorldText, makePinchTarget, buildSegmentedRing, getBoxMesh, createChildObject } from "./GroundTruthGeometryUtils";
import { GroundTruthCorridorController } from "./GroundTruthCorridorController";
import { GroundTruthPotholeController } from "./GroundTruthPotholeController";
import { GroundTruthSnapAnimationController } from "./GroundTruthSnapAnimationController";
import { GroundTruthSessionData } from "./GroundTruthSessionData";
import type { VerifyResult } from "./GroundTruthSnapAnimationController";

@component
export class GroundTruthNextCrewController extends BaseScriptComponent {
    @ui.separator
    @ui.label('<span style="color: #60A5FA;">GroundTruthNextCrewController - LOG stamp/envelope/correction + NEXT_CREW reset loop</span>')
    @ui.separator
    @ui.group_start("References")
    @input
    gasCorridor!: GroundTruthCorridorController;
    @input
    electricCorridor!: GroundTruthCorridorController;
    @input
    telecomCorridor!: GroundTruthCorridorController;
    @input
    pothole!: GroundTruthPotholeController;
    @input
    snapAnim!: GroundTruthSnapAnimationController;
    @input
    groundRoot!: SceneObject;
    @ui.group_end
    @ui.group_start("Settings")
    @input
    @widget(new SliderWidget(1.5, 4, 0.1))
    @hint("Safe-clearance envelope radius as a multiple of the corrected tolerance (envelope is drawn wider than the tight corrected ring).")
    envelopeToleranceMul: number = 2.0;

    @input
    @widget(new SliderWidget(-200, 0, 1))
    @hint("Local Z, relative to the ground anchor, of the 'Next crew arrives' pinch target (near edge of the dirt patch).")
    nextCrewTargetLocalZCm: number = -160;
    @ui.group_end

    public onNextCrewPinched: Event<void> = new Event<void>();

    private stampObj: SceneObject | null = null;
    private envelopeRoot: SceneObject | null = null;
    private nextCrewTagObj: SceneObject | null = null;
    private nextCrewLabelObj: SceneObject | null = null;

    private electricDefaultTolCm: number = 0;
    private telecomDefaultTolCm: number = 0;

    onAwake() {
        if (!this.gasCorridor || !this.electricCorridor || !this.telecomCorridor || !this.pothole || !this.snapAnim || !this.groundRoot) {
            print("GroundTruthNextCrewController: required @input not wired.");
            return;
        }
    }

    // StateMachine calls this once after startAcquire() has built all 3 corridors, so
    // reset() always has a known-good "original" tolerance to restore Electric/Telecom to.
    captureDefaults(): void {
        this.electricDefaultTolCm = this.electricCorridor.getToleranceCm();
        this.telecomDefaultTolCm = this.telecomCorridor.getToleranceCm();
    }

    // StateMachine calls this entering LOG, right after GroundTruthSnapAnimationController
    // reports onVerifyComplete.
    startLog(result: VerifyResult): void {
        GroundTruthSessionData.hasCorrection = true;
        GroundTruthSessionData.correctedOffsetCm = result.offsetCm;
        GroundTruthSessionData.correctedToleranceCm = result.newToleranceCm;

        this.stampObj = makeWorldText(this.groundRoot, "AsBuiltStampLabel", "As-built logged", 5, new vec4(0.6, 1.0, 0.7, 1.0), new vec3(0, 0, 0));
        this.stampObj.getTransform().setWorldPosition(new vec3(result.pipeWorldPos.x, result.pipeWorldPos.y + 20, result.pipeWorldPos.z));

        // Envelope is a GROUND-surface marking (like the tolerance ring), not buried at
        // pipe depth — pipeWorldPos.y is underground, so use the ground anchor's Y instead.
        const groundSurfaceWorldY = this.groundRoot.getTransform().getWorldPosition().y + 1.2;
        this.envelopeRoot = createChildObject(this.groundRoot, "SafeClearanceEnvelope");
        this.envelopeRoot.getTransform().setWorldPosition(new vec3(result.pipeWorldPos.x, groundSurfaceWorldY, result.pipeWorldPos.z));
        const envMat = makeUnlitMaterial(new vec4(0.6, 1.0, 0.7, 1.0), false);
        buildSegmentedRing(this.envelopeRoot, "env", result.newToleranceCm * this.envelopeToleranceMul, 24, envMat);

        this.nextCrewTagObj = makeMeshChild(this.groundRoot, "NextCrewTag", getBoxMesh(), makeUnlitMaterial(new vec4(0.1, 0.8, 1.0, 1.0), false));
        this.nextCrewTagObj.getTransform().setLocalScale(new vec3(12, 10, 4));
        this.nextCrewTagObj.getTransform().setLocalPosition(new vec3(0, 20, this.nextCrewTargetLocalZCm));
        makePinchTarget(this.nextCrewTagObj, new vec3(12, 10, 10), () => this.onNextCrewTagPinched());

        this.nextCrewLabelObj = makeWorldText(this.groundRoot, "NextCrewLabel", "Next crew arrives", 3.5, new vec4(1, 1, 1, 1), new vec3(0, 0, 0));
        this.nextCrewLabelObj.getTransform().setLocalPosition(new vec3(0, 20, this.nextCrewTargetLocalZCm));
    }

    private onNextCrewTagPinched(): void {
        this.resetForNextCrew();
        this.onNextCrewPinched.invoke();
    }

    private resetForNextCrew(): void {
        if (this.stampObj) {
            this.stampObj.destroy();
            this.stampObj = null;
        }
        if (this.envelopeRoot) {
            this.envelopeRoot.destroy();
            this.envelopeRoot = null;
        }
        if (this.nextCrewTagObj) {
            this.nextCrewTagObj.destroy();
            this.nextCrewTagObj = null;
        }
        if (this.nextCrewLabelObj) {
            this.nextCrewLabelObj.destroy();
            this.nextCrewLabelObj = null;
        }
        this.snapAnim.reset();
        this.pothole.reset();

        // Gas rebuilds tighter + shifted onto the corrected true position. Electric and
        // Telecom reassert their original (uncorrected) state — they never changed, but
        // rebuilding keeps all three on the same code path and is cheap.
        this.gasCorridor.build(GroundTruthSessionData.correctedOffsetCm, GroundTruthSessionData.correctedToleranceCm);
        this.electricCorridor.build(0, this.electricDefaultTolCm);
        this.telecomCorridor.build(0, this.telecomDefaultTolCm);
    }
}
