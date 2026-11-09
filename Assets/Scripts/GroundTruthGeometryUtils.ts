// Copyright 2026 Specs Inc.
// Owns: tiny procedural-geometry + world-label helpers shared by every GroundTruth
// controller (corridor layers, segmented rings, arrows, world text). Pure functions —
// no @component, no state. Must not: hold scene refs between calls, know about state.
//
// shortcut: ring/arrow geometry uses stacked Box/Cylinder/Cone primitives instead of a
// true annulus mesh (no custom MeshBuilder winding math needed). Good enough for a
// hackathon demo's "tolerance ring outline" read; upgrade to a real annulus via
// MeshBuilder (TriangleStrip, two-sided) if a filled/continuous ring is ever required.

import { Billboard } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Billboard/Billboard";
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";

const boxMesh = requireAsset("../Meshes/Box.mesh") as RenderMesh;
const cylinderMesh = requireAsset("../Meshes/Cylinder.mesh") as RenderMesh;
const coneMesh = requireAsset("../Meshes/Cone.mesh") as RenderMesh;
const unlitTemplate = requireAsset("../Materials/UnlitTemplate.mat") as Material;

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

// Builds a dashed circular outline (gap between short chord segments) as children of
// `parent`, all sharing ONE material instance so callers can recolor/pulse the whole
// ring by mutating that single material / scaling the parent. Segment length axis is Z
// (so the canonical faceDirection yaw = atan2(dx, -dz) orients it along each chord with
// no extra trig derivation).
export function buildSegmentedRing(
    parent: SceneObject,
    name: string,
    radiusCm: number,
    segments: number,
    material: Material,
    heightCm: number = 1.5,
    thicknessCm: number = 3
): SceneObject[] {
    const segObjs: SceneObject[] = [];
    const pts: { x: number; z: number }[] = [];
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push({ x: radiusCm * Math.cos(a), z: radiusCm * Math.sin(a) });
    }
    for (let i = 0; i < segments; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const dx = p1.x - p0.x;
        const dz = p1.z - p0.z;
        const fullLen = Math.sqrt(dx * dx + dz * dz);
        const len = fullLen * 0.82; // small visual gap between segments
        const midX = (p0.x + p1.x) / 2;
        const midZ = (p0.z + p1.z) / 2;
        const yaw = Math.atan2(dx, -dz);
        const seg = makeMeshChild(parent, name + "_seg" + i, boxMesh, material);
        seg.getTransform().setLocalScale(new vec3(thicknessCm, heightCm, len));
        seg.getTransform().setLocalPosition(new vec3(midX, heightCm / 2, midZ));
        seg.getTransform().setLocalRotation(quat.fromEulerAngles(0, yaw, 0));
        segObjs.push(seg);
    }
    return segObjs;
}
