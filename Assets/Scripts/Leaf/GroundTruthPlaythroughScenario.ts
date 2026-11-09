// Copyright 2026 Specs Inc.
// LEAF end-to-end playthrough: drives a simulated right hand (and left hand for the
// bucket) through ACQUIRE -> APPROACH -> POTHOLE -> VERIFY -> LOG -> NEXT_CREW, since
// AiPreviewAgentInteract.lspkg could not be installed in this session (4 install
// attempts all timed out). Uses only verified scene object names from the live
// runtime query (see GroundTruthCorridorController/RingProximityController/
// PotholeController/SnapAnimationController/NextCrewController sources).

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { findInteractableByName } from "Leaf.lspkg/Interactors/InteractableUtils";
import { LeafHandInteractor } from "Leaf.lspkg/Interactors/interactor/LeafTwoHandInteractor";

@component
export class GroundTruthPlaythroughScenario extends Scenario {
    async run(): Promise<void> {
        // ACQUIRE: default sweepDurationSec=2.5s, then corridors build synchronously.
        await sleep(3500);

        const gasRingObj = findSceneObjectByName("Gas_Ring");
        expect(gasRingObj != null).toBe(true);
        const ringPos = gasRingObj.getTransform().getWorldPosition();

        const right = LeafHandInteractor.get("right");
        const left = LeafHandInteractor.get("left");

        // --- APPROACH: bucket into ring first -> expect danger state + warning beep ---
        const bucket = findInteractableByName("Bucket");
        expect(bucket != null).toBe(true);
        const bucketObj = findSceneObjectByName("Bucket");
        const bucketPos = bucketObj.getTransform().getWorldPosition();
        const toRing = new vec3(ringPos.x - bucketPos.x, 0, ringPos.z - bucketPos.z);
        await left.drag(bucket, toRing, 500);
        await sleep(400);

        const statusLabelObj = findSceneObjectByName("Gas_StatusLabel");
        expect(statusLabelObj.enabled).toBe(true);
        let statusText = (statusLabelObj.getComponent("Component.Text") as Text).text;
        expect(statusText.includes("MACHINE")).toBe(true);

        // Pull the bucket back out of the ring so it doesn't block the dig.
        await left.drag(bucket, toRing.uniformScale(-1), 500);
        await sleep(300);

        // --- APPROACH: hand tip into ring -> amber "HAND DIG OK", auto-advance to POTHOLE ---
        await right.hand.setPosition(ringPos, 300);
        await right.hand.makeGesture("relaxed");
        await sleep(500);

        statusText = (statusLabelObj.getComponent("Component.Text") as Text).text;
        expect(statusLabelObj.enabled).toBe(true);
        expect(statusText.includes("HAND DIG OK")).toBe(true);

        // --- POTHOLE: scoop strokes (down >=3cm dip then up) until full depth ---
        // depthCm confirmed 90 via corridor geometry; strokeDeepenCm default 10 -> 9
        // strokes needed. Loop extra to tolerate a lower configured deepen amount;
        // once onPotholeComplete fires, further strokes are no-ops (active=false).
        for (let i = 0; i < 14; i++) {
            await right.hand.setPosition(ringPos.add(new vec3(0, 8, 0)), 200);
            await right.hand.setPosition(ringPos.add(new vec3(0, -8, 0)), 200);
            await right.hand.setPosition(ringPos.add(new vec3(0, 8, 0)), 200);
        }
        await sleep(600);

        const gaugeObj = findSceneObjectByName("Gas_DepthGauge");
        expect(gaugeObj != null).toBe(true);
        const gaugeText = (gaugeObj.getComponent("Component.Text") as Text).text;
        expect(gaugeText.includes("0.0 m")).toBe(true);

        // --- VERIFY: true pipe + Confirm exposed pinch target; trigger the snap tween ---
        const confirmTag = findInteractableByName("Gas_ConfirmTag");
        expect(confirmTag != null).toBe(true);
        await right.trigger(confirmTag);
        await sleep(1600); // let the 1.2s tween play out + settle

        const arrowLabel = findSceneObjectByName("OffsetArrow_Label");
        expect(arrowLabel != null).toBe(true);
        expect(arrowLabel.enabled).toBe(true);
        const arrowText = (arrowLabel.getComponent("Component.Text") as Text).text;
        expect(arrowText.includes("Map was off by")).toBe(true);

        // --- LOG: stamp + envelope + Next crew pinch target ---
        const stamp = findSceneObjectByName("AsBuiltStampLabel");
        expect(stamp != null).toBe(true);
        expect(stamp.enabled).toBe(true);

        const nextCrewTag = findInteractableByName("NextCrewTag");
        expect(nextCrewTag != null).toBe(true);

        // --- NEXT_CREW: pinch resets loop, Gas rebuilds tight + shifted ---
        await right.trigger(nextCrewTag);
        await sleep(600);

        const stampAfter = findSceneObjectByName("AsBuiltStampLabel");
        expect(stampAfter == null).toBe(true);

        const gasRingAfter = findSceneObjectByName("Gas_Ring");
        expect(gasRingAfter != null).toBe(true);
        const posAfter = gasRingAfter.getTransform().getWorldPosition();
        // correctionOffsetCm default 70cm sideways in +Z -> ring should have moved.
        expect(Math.abs(posAfter.z - ringPos.z) > 30).toBe(true);
    }
}
