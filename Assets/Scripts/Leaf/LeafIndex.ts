// Copyright 2026 Specs Inc.
// LEAF scenario registration root for GroundTruth testing.

import { scenariosIndex } from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator";
import { ScenarioMetadata } from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata";
import { GroundTruthPlaythroughScenario } from "./GroundTruthPlaythroughScenario";

@component
export class LeafIndex extends BaseScriptComponent {
    @scenariosIndex
    static scenariosIndex: ScenarioMetadata[] = [
        {
            id: "groundtruth-playthrough",
            typename: GroundTruthPlaythroughScenario.getTypeName(),
        },
    ];
}
