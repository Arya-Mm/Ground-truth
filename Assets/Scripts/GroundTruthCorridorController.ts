// Copyright 2026 Specs Inc.
// Owns: ONE utility's uncertainty corridor (nested translucent boxes, depth = utility
// depth), its ground-surface tolerance-ring outline, and its "Gas . +/-0.5 m . ~0.9 m
// deep" world label, plus distance-based fade. Does NOT own hand/bucket proximity logic
// (GroundTruthRingProximityController) or state transitions (GroundTruthStateMachine) —
// those call into this controller's public build()/updateLive()/setRingColor() API.
//
// One instance of this component exists per utility (Gas / Electric / Telecom), wired
// by the bootstrap with its own color/depth/tolerance/line-position @inputs.

import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import {
    makeUnlitMaterial,
    makeMeshChild,
    makeWorldText,
    addBillboard,
    buildSegmentedRing,
    getBoxMesh,
    lerp,
    createChildObject,
} from "./GroundTruthGeometryUtils";

// More, narrower nested layers with a smoother alpha curve than the original 3-step
// stack -- reads as a soft/volumetric fuzzy-edged corridor instead of a flat tinted
// slab. Widths are same spirit as before (1.0 = full tolerance width down to a narrow
// core), alphas ramp gently so there's no hard visible band edge.
const LAYER_WIDTH_MULS = [1.0, 0.82, 0.62, 0.42, 0.22];
const LAYER_BASE_ALPHAS = [0.05, 0.09, 0.15, 0.24, 0.38];
const RING_SEGMENTS = 24;
// Ground-surface decals (line mark, ring) must clear the dirt patch's top face.
// shortcut: hardcodes the bootstrap-authored DirtPatch thickness (2cm box, so top face
// is at local Y=+1 under groundRoot) rather than querying it; if DirtPatch's scale.y
// changes, bump this to stay above it.
const GROUND_SURFACE_Y_CM = 1.2;

@component
export class GroundTruthCorridorController extends BaseScriptComponent {
    @ui.separator
    @ui.label('<span style="color: #60A5FA;">GroundTruthCorridorController - one utility\'s corridor + ring + label</span>')
    @ui.separator
    @ui.group_start("References")
    // Authored anchor (child of the GroundTruthWorld root) this utility's visuals are
    // parented under. Its local Z=0 is the ground-truth site anchor; this utility's
    // line sits at lineLocalZCm relative to it.
    @input
    @hint("Authored ground anchor SceneObject this corridor/ring/label are built under.")
    groundRoot!: SceneObject;
    @ui.group_end
    @ui.group_start("Settings")
    @input
    @hint("Display name used in the world label, e.g. 'Gas'.")
    utilityName: string = "Gas";

    @input("vec4", "1.0, 0.85, 0.0, 1.0")
    @widget(new ColorWidget())
    @hint("APWA locate-mark color for this utility (yellow=gas, red=electric, orange=telecom).")
    baseColor: vec4 = new vec4(1.0, 0.85, 0.0, 1.0);

    @input
    @widget(new SliderWidget(10, 150, 1))
    @hint("Locate tolerance each side of the mapped line, in cm. Ring radius and corridor half-width both derive from this.")
    toleranceCm: number = 50;

    @input
    @widget(new SliderWidget(10, 150, 1))
    @hint("Depth of this utility below the ground surface, in cm.")
    depthCm: number = 90;

    @input
    @widget(new SliderWidget(20, 250, 1))
    @hint("Half-length of the painted locate line / corridor along local X, in cm.")
    lineHalfLengthCm: number = 140;

    @input
    @widget(new SliderWidget(-500, 500, 1))
    @hint("Local Z offset of this utility's line from the ground anchor, in cm.")
    lineLocalZCm: number = -200;

    @input
    @widget(new SliderWidget(0.5, 5, 0.1))
    @hint("Distance from the camera (meters) within which the corridor/ring/label show at full strength; beyond this they fade to a faint 'distant' state.")
    proximityFadeDistanceM: number = 2.0;
    @ui.group_end

    private corridorRoot: SceneObject | null = null;
    private corridorLayerObjs: SceneObject[] = [];
    private corridorLayerMats: Material[] = [];
    private ringRoot: SceneObject | null = null;
    private ringMaterial: Material | null = null;
    private labelObj: SceneObject | null = null;
    private lineMarkObj: SceneObject | null = null;

    private currentOffsetCm: number = 0;
    // Set false by SnapAnimationController during/after the VERIFY tween so the
    // per-frame distance fade doesn't fight the tween's own alpha writes.
    private fadeEnabled: boolean = true;

    onAwake() {
        if (!this.groundRoot) {
            print("GroundTruthCorridorController(" + this.utilityName + "): groundRoot not wired.");
            return;
        }
        this.createEvent("UpdateEvent").bind(() => this.updateFade());
    }

    // Paints the static decal line on the ground. Called once; the line never moves
    // (even after a correction — only the corridor/ring shift to the true position).
    paintLineMark(): void {
        if (this.lineMarkObj) return;
        const mat = makeUnlitMaterial(this.baseColor, false);
        this.lineMarkObj = makeMeshChild(this.groundRoot, this.utilityName + "_LineMark", getBoxMesh(), mat);
        this.lineMarkObj.getTransform().setLocalScale(new vec3(2 * this.lineHalfLengthCm, 0.6, 6));
        this.lineMarkObj.getTransform().setLocalPosition(new vec3(0, GROUND_SURFACE_Y_CM, this.lineLocalZCm));
    }

    // (Re)builds the corridor + ring + label at a given lateral offset / tolerance.
    // offsetCm=0, toleranceCm=this default -> original mapped state (ACQUIRE).
    // Called again by NEXT_CREW with the corrected offset/tolerance for Gas, or with
    // (0, originalTolerance) to reassert Electric/Telecom's uncorrected state.
    build(offsetCm: number, toleranceCm: number): void {
        this.paintLineMark();
        this.currentOffsetCm = offsetCm;
        this.toleranceCm = toleranceCm;
        this.fadeEnabled = true;

        if (this.corridorRoot) this.corridorRoot.destroy();
        if (this.ringRoot) this.ringRoot.destroy();
        if (this.labelObj) this.labelObj.destroy();

        this.corridorRoot = createChildObject(this.groundRoot, this.utilityName + "_Corridor");
        this.corridorLayerObjs = [];
        this.corridorLayerMats = [];
        for (let i = 0; i < LAYER_WIDTH_MULS.length; i++) {
            const mat = makeUnlitMaterial(
                new vec4(this.baseColor.x, this.baseColor.y, this.baseColor.z, LAYER_BASE_ALPHAS[i]),
                true
            );
            // Corridor is literally underground (negative local Y) -- without this it's
            // invisible from a normal standing view angle, hidden behind the opaque dirt
            // patch, only visible from directly above/inside the dug hole. Disabling the
            // depth test makes it read through the ground like the brief's "ground itself
            // shows a fuzzy uncertainty corridor" x-ray visualization.
            mat.mainPass.depthTest = false;
            mat.mainPass.depthWrite = false; // never occlude anything drawn after it
            const obj = makeMeshChild(this.corridorRoot, "layer" + i, getBoxMesh(), mat);
            const widthCm = 2 * toleranceCm * LAYER_WIDTH_MULS[i];
            obj.getTransform().setLocalScale(new vec3(2 * this.lineHalfLengthCm, this.depthCm, widthCm));
            obj.getTransform().setLocalPosition(new vec3(0, -this.depthCm / 2, this.lineLocalZCm + offsetCm));
            this.corridorLayerObjs.push(obj);
            this.corridorLayerMats.push(mat);
        }

        this.ringRoot = createChildObject(this.groundRoot, this.utilityName + "_Ring");
        this.ringMaterial = makeUnlitMaterial(this.baseColor, false);
        buildSegmentedRing(this.ringRoot, "ring", toleranceCm, RING_SEGMENTS, this.ringMaterial);
        this.ringRoot.getTransform().setLocalPosition(new vec3(0, GROUND_SURFACE_Y_CM, this.lineLocalZCm + offsetCm));

        this.labelObj = makeWorldText(
            this.groundRoot,
            this.utilityName + "_Label",
            this.utilityName + " · ±" + (toleranceCm / 100).toFixed(1) + " m · ~" + (this.depthCm / 100).toFixed(1) + " m deep",
            6,
            new vec4(1, 1, 1, 1),
            new vec3(0, 20, this.lineLocalZCm + offsetCm)
        );
    }

    // Drives the VERIFY snap tween: lerps width/offset/opacity toward the true pipe's
    // narrow, solid state without destroying/recreating objects every frame.
    updateLive(t: number, startOffsetCm: number, endOffsetCm: number, startTolCm: number, endTolCm: number): void {
        const offsetCm = lerp(startOffsetCm, endOffsetCm, t);
        const tolCm = lerp(startTolCm, endTolCm, t);
        this.currentOffsetCm = offsetCm;
        this.toleranceCm = tolCm;
        for (let i = 0; i < this.corridorLayerObjs.length; i++) {
            const widthCm = 2 * tolCm * LAYER_WIDTH_MULS[i];
            const alpha = lerp(LAYER_BASE_ALPHAS[i], 0.95, t);
            this.corridorLayerObjs[i].getTransform().setLocalScale(new vec3(2 * this.lineHalfLengthCm, this.depthCm, widthCm));
            this.corridorLayerObjs[i].getTransform().setLocalPosition(new vec3(0, -this.depthCm / 2, this.lineLocalZCm + offsetCm));
            const c = this.baseColor;
            this.corridorLayerMats[i].mainPass.baseColor = new vec4(c.x, c.y, c.z, alpha);
        }
        if (this.ringRoot) {
            this.ringRoot.getTransform().setLocalPosition(new vec3(0, GROUND_SURFACE_Y_CM, this.lineLocalZCm + offsetCm));
        }
    }

    // Ring-only dynamic recolor (RingProximityController drives this for Gas: green
    // default-safe / amber hand-in-tolerance / red machine-in-tolerance). pulse=true
    // scales the ring root up/down once per call for the danger-state pulse.
    setRingColor(color: vec4, pulse: boolean): void {
        if (this.ringMaterial) {
            this.ringMaterial.mainPass.baseColor = color;
        }
        if (pulse && this.ringRoot) {
            const base = 1.0;
            const pulseScale = base + 0.12 * Math.sin(getTime() * 10.0);
            this.ringRoot.getTransform().setLocalScale(new vec3(pulseScale, 1, pulseScale));
        } else if (this.ringRoot) {
            this.ringRoot.getTransform().setLocalScale(new vec3(1, 1, 1));
        }
    }

    getRingWorldPosition(): vec3 {
        if (this.ringRoot) return this.ringRoot.getTransform().getWorldPosition();
        return this.groundRoot.getTransform().getWorldPosition();
    }

    getToleranceCm(): number {
        return this.toleranceCm;
    }

    getCurrentOffsetCm(): number {
        return this.currentOffsetCm;
    }

    setLabelText(text: string): void {
        if (!this.labelObj) return;
        const t = this.labelObj.getComponent("Component.Text") as Text;
        if (t) t.text = text;
    }

    setVisible(visible: boolean): void {
        if (this.corridorRoot) this.corridorRoot.enabled = visible;
        if (this.ringRoot) this.ringRoot.enabled = visible;
        if (this.labelObj) this.labelObj.enabled = visible;
    }

    setFadeEnabled(enabled: boolean): void {
        this.fadeEnabled = enabled;
    }

    private updateFade(): void {
        // corridorRoot itself is never positioned (only its layer children carry the
        // lineLocalZCm/offset translation) — measuring distance to it would measure
        // distance to groundRoot's own origin instead of this utility's actual line.
        // ringRoot IS positioned at the real line/offset location, so use that.
        if (!this.corridorRoot || !this.ringRoot || !this.fadeEnabled) return;
        const cam = WorldCameraFinderProvider.getInstance().getComponent().getTransform().getWorldPosition();
        const corridorPos = this.ringRoot.getTransform().getWorldPosition();
        const dx = cam.x - corridorPos.x;
        const dy = cam.y - corridorPos.y;
        const dz = cam.z - corridorPos.z;
        const distM = Math.sqrt(dx * dx + dy * dy + dz * dz) / 100;
        const near = distM <= this.proximityFadeDistanceM;
        if (this.labelObj) this.labelObj.enabled = near;
        const fadeMul = near ? 1.0 : 0.25;
        for (let i = 0; i < this.corridorLayerMats.length; i++) {
            const base = LAYER_BASE_ALPHAS[i];
            const c = this.baseColor;
            this.corridorLayerMats[i].mainPass.baseColor = new vec4(c.x, c.y, c.z, base * fadeMul);
        }
    }
}
