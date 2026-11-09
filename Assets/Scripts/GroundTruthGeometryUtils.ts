// Copyright 2026 Specs Inc.
// Owns: tiny procedural-geometry + world-label helpers shared by every GroundTruth
// controller (corridor layers, segmented rings, arrows, world text). Pure functions —
// no @component, no state. Must not: hold scene refs between calls, know about state.
//
// Visual-polish pass (2026): tolerance rings are now true curved dashed annuli built
// per-call with MeshBuilder (buildArcDashMesh/buildSegmentedRing) instead of straight
// box chords — each dash is itself subdivided along the real circle arc, so it reads as
// a circle at any radius instead of a polygon. World labels (makeWorldText) now get an
// automatic soft dark backing panel sized to the text for legibility.
// shortcut: label backing panel is sized by a character-count heuristic (not real glyph
// metrics), so labels whose text changes later (score/status/gauge) keep their
// first-build panel size — fine for this project's short, similar-length label strings.

import { Billboard } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Billboard/Billboard";
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";

const boxMesh = requireAsset("../Meshes/Box.mesh") as RenderMesh;
const cylinderMesh = requireAsset("../Meshes/Cylinder.mesh") as RenderMesh;
const coneMesh = requireAsset("../Meshes/Cone.mesh") as RenderMesh;
// Visual-polish pass (2026): swapped from the plain UnlitTemplate to a fresnel rim-glow +
// shimmer custom-code shader (see Materials/codeNode.graphShader) so every unlit surface
// built through makeUnlitMaterial (corridor layers, ring, line mark, label backing) reads
// as one cohesive holographic design language instead of flat tinted shapes. baseColor is
// still the only script-facing property -- callers' mat.mainPass.baseColor writes are untouched.
const unlitTemplate = requireAsset("../Materials/GroundTruthGlowUnlit.mat") as Material;

export function getBoxMesh(): RenderMesh {
    return boxMesh;
}
export function getCylinderMesh(): RenderMesh {
    return cylinderMesh;
}
export function getConeMesh(): RenderMesh {
    return coneMesh;
}

// Clones the shared Unlit template and tints it. translucent=true switches the clone's
// pass to alpha blending (base template ships opaque/Disabled blend).
export function makeUnlitMaterial(color: vec4, translucent: boolean = false): Material {
    const mat = unlitTemplate.clone() as Material;
    mat.mainPass.baseColor = color;
    if (translucent) {
        mat.mainPass.blendMode = BlendMode.Normal;
    }
    return mat;
}

// SceneObject has no createSceneObject of its own — children are created via the
// global Scene and then reparented.
export function createChildObject(parent: SceneObject, name: string): SceneObject {
    const obj = global.scene.createSceneObject(name);
    obj.setParent(parent);
    return obj;
}

export function makeMeshChild(parent: SceneObject, name: string, mesh: RenderMesh, material: Material): SceneObject {
    const obj = createChildObject(parent, name);
    const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = mesh;
    rmv.mainMaterial = material;
    return obj;
}

export function addBillboard(obj: SceneObject): void {
    obj.createComponent(Billboard.getTypeName());
}

// size cm -> Text.size (size/43.886 = world em-square height in cm, per Text.size doc).
export function cmToTextSize(cm: number): number {
    return Math.max(2, cm * 43.886);
}

// Dark, semi-translucent backing so white world-text stays legible over any background
// (dirt, sky, corridor glow) — one consistent color across every label in the scene.
const LABEL_BG_COLOR = new vec4(0.03, 0.03, 0.06, 0.72);

export function makeWorldText(
    parent: SceneObject,
    name: string,
    text: string,
    heightCm: number,
    color: vec4,
    localPos: vec3
): SceneObject {
    const obj = createChildObject(parent, name);
    const t = obj.createComponent("Component.Text") as Text;
    t.text = text;
    t.size = cmToTextSize(heightCm);
    t.textFill.color = color;
    t.depthTest = true;
    obj.getTransform().setLocalPosition(localPos);
    addBillboard(obj);

    // Backing panel: a flat card behind the text, sized by a char-count heuristic
    // (~0.58x the glyph height per character, plus padding). Pushed back along local -Z
    // (away from the camera on a billboarded object) so the GPU depth test draws the
    // text on top regardless of scene-graph order.
    const panelW = Math.max(heightCm * 2.2, text.length * heightCm * 0.6 + heightCm * 1.4);
    const panelH = heightCm * 2.0;
    const panelMat = makeUnlitMaterial(LABEL_BG_COLOR, true);
    const panel = makeMeshChild(obj, "bg", getBoxMesh(), panelMat);
    panel.getTransform().setLocalScale(new vec3(panelW, panelH, 0.4));
    panel.getTransform().setLocalPosition(new vec3(0, 0, -0.6));
    return obj;
}

export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

export function clamp01(t: number): number {
    return t < 0 ? 0 : t > 1 ? 1 : t;
}

// Pinch target >= 6cm, per comfort rule. Created well after initial scene load (during
// VERIFY/LOG state transitions), so unlike SIK's own onAwake-race guidance, subscribing
// right after createComponent is safe here — createComponent runs the new component's
// startup lifecycle inline, synchronously, before control returns to this call.
export function makePinchTarget(obj: SceneObject, colliderSizeCm: vec3, onTap: () => void): void {
    let collider = obj.getComponent("Physics.ColliderComponent");
    if (!collider) {
        collider = obj.createComponent("Physics.ColliderComponent");
        const shape = Shape.createBoxShape();
        shape.size = colliderSizeCm;
        collider.shape = shape;
    }
    let interactable = obj.getComponent(Interactable.getTypeName()) as Interactable;
    if (!interactable) {
        interactable = obj.createComponent(Interactable.getTypeName()) as Interactable;
    }
    interactable.targetingMode = 3;
    interactable.onTriggerStart.add((_e: InteractorEvent) => onTap());
}

export function worldHorizontalDistance(a: vec3, b: vec3): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}

const RING_VERTEX_LAYOUT = [
    { name: "position", components: 3 },
    { name: "normal", components: 3 },
];
const RING_ARC_STEPS_PER_DASH = 6; // subdivisions per dash -> true curve, not a chord

// Pushes one dash of a ring as a small curved wedge (inner wall + outer wall + top face
// + capped ends) into the shared vertex/index arrays, in parent-local space (Y=0 at the
// ground surface up to Y=heightCm). Faces are emitted double-sided (both triangle
// windings) since winding convention isn't verified here and an invisible back-face
// would be worse than a few extra triangles on this small a mesh.
function appendRingDash(
    verts: number[],
    indices: number[],
    radiusCm: number,
    thicknessCm: number,
    heightCm: number,
    startAngle: number,
    endAngle: number,
    arcSteps: number
): void {
    const innerR = radiusCm - thicknessCm / 2;
    const outerR = radiusCm + thicknessCm / 2;
    const base = verts.length / 6;

    const pushV = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
        verts.push(x, y, z, nx, ny, nz);
    };
    const pushQuadDS = (a: number, b: number, c: number, d: number) => {
        indices.push(a, b, c, a, c, d);
        indices.push(a, c, b, a, d, c);
    };

    for (let i = 0; i <= arcSteps; i++) {
        const a = startAngle + (endAngle - startAngle) * (i / arcSteps);
        const cx = Math.cos(a);
        const cz = Math.sin(a);
        pushV(innerR * cx, heightCm, innerR * cz, -cx, 0.3, -cz); // TI
        pushV(outerR * cx, heightCm, outerR * cz, cx, 0.3, cz); // TO
        pushV(outerR * cx, 0, outerR * cz, cx, 0, cz); // BO
        pushV(innerR * cx, 0, innerR * cz, -cx, 0, -cz); // BI
    }

    for (let i = 0; i < arcSteps; i++) {
        const o0 = base + i * 4;
        const o1 = base + (i + 1) * 4;
        const TI0 = o0, TO0 = o0 + 1, BO0 = o0 + 2, BI0 = o0 + 3;
        const TI1 = o1, TO1 = o1 + 1, BO1 = o1 + 2, BI1 = o1 + 3;
        pushQuadDS(TI0, TO0, TO1, TI1); // top
        pushQuadDS(TO0, BO0, BO1, TO1); // outer wall
        pushQuadDS(BI0, TI0, TI1, BI1); // inner wall
    }
    // end caps (close the cross-section at each end of the dash)
    const s0 = base, s1 = base + arcSteps * 4;
    pushQuadDS(s0, s0 + 1, s0 + 2, s0 + 3);
    pushQuadDS(s1, s1 + 1, s1 + 2, s1 + 3);
}

// Builds a true curved dashed ring (annulus arcs, not straight chords) as ONE mesh
// under a new child of `parent`, using `material` directly so callers can still
// recolor/pulse the whole ring by mutating that material / scaling the parent.
export function buildSegmentedRing(
    parent: SceneObject,
    name: string,
    radiusCm: number,
    segments: number,
    material: Material,
    heightCm: number = 1.5,
    thicknessCm: number = 3
): SceneObject[] {
    const verts: number[] = [];
    const indices: number[] = [];
    const slot = (Math.PI * 2) / segments;
    const dashSpan = slot * 0.82; // same dash:gap ratio as the original chord ring
    const gapHalf = (slot - dashSpan) / 2;

    for (let i = 0; i < segments; i++) {
        const slotStart = i * slot;
        appendRingDash(
            verts,
            indices,
            radiusCm,
            thicknessCm,
            heightCm,
            slotStart + gapHalf,
            slotStart + gapHalf + dashSpan,
            RING_ARC_STEPS_PER_DASH
        );
    }

    const mb = new MeshBuilder(RING_VERTEX_LAYOUT);
    mb.topology = MeshTopology.Triangles;
    mb.indexType = MeshIndexType.UInt16;
    mb.appendVerticesInterleaved(verts);
    mb.appendIndices(indices);
    mb.updateMesh();

    const obj = createChildObject(parent, name);
    const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = mb.getMesh();
    rmv.mainMaterial = material;
    return [obj];
}
