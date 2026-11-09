// Copyright 2026 Specs Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Copied verbatim from ls-clad:specs-interaction-recipes §5 (drop-in recipe, not
// modified). Used here on the excavator-bucket "machine tool" so it's SIK-grabbable
// without hand-rolling Interactable/InteractableManipulation wiring.

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractableManipulation } from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";

/**
 * DragInteraction
 *
 * Drop-in @component for object grab-and-move. Wraps SIK's `Interactable` +
 * `InteractableManipulation` and exposes named hooks plus a per-frame position
 * update while dragging.
 *
 * Usage:
 *   // 1. Attach this script to the scene object you want to drag (a ColliderComponent
 *   //    will be auto-created if the object doesn't have one).
 *   // 2. Subscribe from your main script:
 *   //      const drag = sceneObj.getComponent("ScriptComponent") as DragInteraction;
 *   //      drag.onDragStart.add(() => print("grabbed"));
 *   //      drag.onDragUpdate.add((pos) => print("now at " + pos.toString()));
 *   //      drag.onDragEnd.add(() => print("released"));
 */

@component
export class DragInteraction extends BaseScriptComponent {

    // Configuration — modify before onAwake or via inspector defaults
    private CONFIG = {
        autoCreateCollider: true,           // Create a box collider if the object doesn't have one
        colliderSize: new vec3(10, 10, 10), // cm — only used when autoCreateCollider
        debugCollider: false,               // Show wireframe while prototyping
        targetingMode: 3,                   // 1 = Direct, 2 = Indirect (raycast), 3 = Both
    };

    // Public signals — subscribe from any other component
    public onDragStart: Event<void> = new Event<void>();
    public onDragEnd: Event<void> = new Event<void>();
    public onDragUpdate: Event<vec3> = new Event<vec3>();

    private interactable: Interactable;
    private manipulation: InteractableManipulation;
    private isDragging: boolean = false;

    onAwake() {
        this.ensureCollider();
        this.ensureInteractable();
        this.ensureManipulation();

        this.createEvent("OnStartEvent").bind(() => {
            this.manipulation.onManipulationStart.add(() => {
                this.isDragging = true;
                this.onDragStart.invoke();
            });

            this.manipulation.onManipulationEnd.add(() => {
                this.isDragging = false;
                this.onDragEnd.invoke();
            });
        });

        this.createEvent("UpdateEvent").bind(() => {
            if (this.isDragging) {
                this.onDragUpdate.invoke(this.getSceneObject().getTransform().getWorldPosition());
            }
        });
    }

    private ensureCollider() {
        let collider = this.getSceneObject().getComponent("Physics.ColliderComponent");
        if (!collider && this.CONFIG.autoCreateCollider) {
            collider = this.getSceneObject().createComponent("Physics.ColliderComponent");
            const shape = Shape.createBoxShape();
            shape.size = this.CONFIG.colliderSize;
            collider.shape = shape;
        }
        if (collider) {
            collider.debugDrawEnabled = this.CONFIG.debugCollider;
        }
    }

    private ensureInteractable() {
        this.interactable = this.getSceneObject().getComponent(Interactable.getTypeName());
        if (!this.interactable) {
            this.interactable = this.getSceneObject().createComponent(Interactable.getTypeName());
        }
        this.interactable.targetingMode = this.CONFIG.targetingMode;
    }

    private ensureManipulation() {
        this.manipulation = this.getSceneObject().getComponent(InteractableManipulation.getTypeName());
        if (!this.manipulation) {
            this.manipulation = this.getSceneObject().createComponent(InteractableManipulation.getTypeName());
        }
        this.manipulation.enabled = true;
    }
}
