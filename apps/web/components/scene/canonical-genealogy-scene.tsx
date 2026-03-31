"use client";

import { Line, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

import type { GraphChunk, PersonSummary } from "@/lib/api";

type CanonicalGenealogySceneProps = {
  chunk: GraphChunk;
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
};

type Point3 = [number, number, number];

type SceneConnector = {
  key: string;
  points: Point3[];
  color: string;
  opacity: number;
  lineWidth: number;
};

type SceneJoint = {
  key: string;
  position: Point3;
  color: string;
  scale: number;
};

type FamilyGroup = {
  key: string;
  parentIds: string[];
  childIds: string[];
};

type PartnerUnit = {
  ids: string[];
};

type SceneLayout = {
  positions: Map<string, Point3>;
  connectors: SceneConnector[];
  joints: SceneJoint[];
  target: Point3;
};

function nodeColor(node: PersonSummary, isSelected: boolean) {
  if (isSelected) {
    return "#f7b267";
  }

  if (node.isMasked) {
    return "#91a7b7";
  }

  if (node.branch === "Pilot household") {
    return "#9ad1d4";
  }

  return "#d7c49e";
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function averagePoint(points: Point3[]): Point3 {
  return [
    average(points.map((point) => point[0])),
    average(points.map((point) => point[1])),
    average(points.map((point) => point[2])),
  ];
}

function collapseDuplicatePoints(points: Point3[]) {
  return points.filter((point, index) => {
    if (index === 0) {
      return true;
    }

    const previousPoint = points[index - 1];
    return (
      point[0] !== previousPoint[0] ||
      point[1] !== previousPoint[1] ||
      point[2] !== previousPoint[2]
    );
  });
}

function sortNodeIdsByName(ids: string[], nodesById: Map<string, PersonSummary>) {
  return [...ids].sort((left, right) =>
    (nodesById.get(left)?.displayName ?? left).localeCompare(
      nodesById.get(right)?.displayName ?? right,
    ),
  );
}

function buildPartnerUnits(
  nodeIds: string[],
  generation: number,
  nodesById: Map<string, PersonSummary>,
  partnerIdsByPersonId: Map<string, Set<string>>,
  generationById: Map<string, number>,
) {
  const units: PartnerUnit[] = [];
  const seen = new Set<string>();

  sortNodeIdsByName(nodeIds, nodesById).forEach((nodeId) => {
    if (seen.has(nodeId)) {
      return;
    }

    const partnerIds = sortNodeIdsByName(
      [...(partnerIdsByPersonId.get(nodeId) ?? new Set<string>())].filter(
        (partnerId) =>
          nodeIds.includes(partnerId) && (generationById.get(partnerId) ?? -1) === generation,
      ),
      nodesById,
    );

    const partnerId = partnerIds.find((candidateId) => !seen.has(candidateId));
    if (partnerId) {
      const ids = sortNodeIdsByName([nodeId, partnerId], nodesById);
      ids.forEach((id) => seen.add(id));
      units.push({ ids });
      return;
    }

    seen.add(nodeId);
    units.push({ ids: [nodeId] });
  });

  return units;
}

function buildSceneLayout(chunk: GraphChunk): SceneLayout {
  const nodesById = new Map(chunk.nodes.map((node) => [node.id, node]));
  const parentIdsByChildId = new Map<string, string[]>();
  const familyGroupByChildId = new Map<string, FamilyGroup>();
  const familyGroupsByKey = new Map<string, FamilyGroup>();
  const partnerIdsByPersonId = new Map<string, Set<string>>();
  const partnerPairKeys = new Set<string>();

  chunk.relationships.forEach((relationship) => {
    if (relationship.kind === "parent_of") {
      const parentIds = parentIdsByChildId.get(relationship.targetId) ?? [];
      if (!parentIds.includes(relationship.sourceId)) {
        parentIds.push(relationship.sourceId);
      }
      parentIdsByChildId.set(relationship.targetId, parentIds);
      return;
    }

    if (relationship.kind !== "partner_of") {
      return;
    }

    const pairKey = [relationship.sourceId, relationship.targetId].sort().join("|");
    partnerPairKeys.add(pairKey);

    const sourcePartners = partnerIdsByPersonId.get(relationship.sourceId) ?? new Set<string>();
    sourcePartners.add(relationship.targetId);
    partnerIdsByPersonId.set(relationship.sourceId, sourcePartners);

    const targetPartners = partnerIdsByPersonId.get(relationship.targetId) ?? new Set<string>();
    targetPartners.add(relationship.sourceId);
    partnerIdsByPersonId.set(relationship.targetId, targetPartners);
  });

  parentIdsByChildId.forEach((parentIds, childId) => {
    const sortedParentIds = sortNodeIdsByName(parentIds, nodesById);
    const familyKey = sortedParentIds.join("|") || `solo:${childId}`;
    const existingGroup = familyGroupsByKey.get(familyKey);

    if (existingGroup) {
      existingGroup.childIds.push(childId);
      familyGroupByChildId.set(childId, existingGroup);
      return;
    }

    const group: FamilyGroup = {
      key: familyKey,
      parentIds: sortedParentIds,
      childIds: [childId],
    };
    familyGroupsByKey.set(familyKey, group);
    familyGroupByChildId.set(childId, group);
  });

  const familyGroups = [...familyGroupsByKey.values()].map((group) => ({
    ...group,
    childIds: sortNodeIdsByName([...new Set(group.childIds)], nodesById),
  }));

  const generationById = new Map<string, number>();
  const generationTrail = new Set<string>();

  function ancestralGenerationFor(personId: string): number {
    const cachedGeneration = generationById.get(personId);
    if (cachedGeneration !== undefined) {
      return cachedGeneration;
    }

    if (generationTrail.has(personId)) {
      return 0;
    }

    generationTrail.add(personId);
    const parentIds = parentIdsByChildId.get(personId) ?? [];
    const generation =
      parentIds.length > 0
        ? Math.max(...parentIds.map((parentId) => ancestralGenerationFor(parentId) + 1))
        : 0;
    generationTrail.delete(personId);
    generationById.set(personId, generation);
    return generation;
  }

  chunk.nodes.forEach((node) => {
    ancestralGenerationFor(node.id);
  });

  for (let iteration = 0; iteration < 12; iteration += 1) {
    let changed = false;

    partnerPairKeys.forEach((pairKey) => {
      const [leftId, rightId] = pairKey.split("|");
      const nextGeneration = Math.max(
        generationById.get(leftId) ?? 0,
        generationById.get(rightId) ?? 0,
      );

      if ((generationById.get(leftId) ?? 0) !== nextGeneration) {
        generationById.set(leftId, nextGeneration);
        changed = true;
      }

      if ((generationById.get(rightId) ?? 0) !== nextGeneration) {
        generationById.set(rightId, nextGeneration);
        changed = true;
      }
    });

    parentIdsByChildId.forEach((parentIds, childId) => {
      const nextGeneration = Math.max(...parentIds.map((parentId) => generationById.get(parentId) ?? 0)) + 1;
      if ((generationById.get(childId) ?? 0) !== nextGeneration) {
        generationById.set(childId, nextGeneration);
        changed = true;
      }
    });

    if (!changed) {
      break;
    }
  }

  const maxGeneration = Math.max(...chunk.nodes.map((node) => generationById.get(node.id) ?? 0), 0);
  const nodeIdsByGeneration = new Map<number, string[]>();

  chunk.nodes.forEach((node) => {
    const generation = generationById.get(node.id) ?? 0;
    const generationIds = nodeIdsByGeneration.get(generation) ?? [];
    generationIds.push(node.id);
    nodeIdsByGeneration.set(generation, generationIds);
  });

  nodeIdsByGeneration.forEach((nodeIds, generation) => {
    nodeIdsByGeneration.set(generation, sortNodeIdsByName(nodeIds, nodesById));
  });

  const xById = new Map<string, number>();
  const zById = new Map<string, number>();
  const unitGap = 4.4;
  const partnerSpacing = 1.85;
  const partnerDepthSpacing = 0.85;
  const siblingDepthSpacing = 1.05;
  const generationGap = 4.8;
  const generationDepthGap = 2.6;

  const rootIds = nodeIdsByGeneration.get(0) ?? [];
  const rootUnits = buildPartnerUnits(rootIds, 0, nodesById, partnerIdsByPersonId, generationById);
  let rootCursor = 0;

  rootUnits.forEach((unit, index) => {
    if (index > 0) {
      rootCursor += unitGap;
    }

    const centerX = rootCursor;
    const centerZ = (index - (rootUnits.length - 1) / 2) * 4.8;

    unit.ids.forEach((id, memberIndex) => {
      xById.set(id, centerX + (memberIndex - (unit.ids.length - 1) / 2) * partnerSpacing);
      zById.set(id, centerZ + (memberIndex - (unit.ids.length - 1) / 2) * partnerDepthSpacing);
    });

    rootCursor += Math.max(0, (unit.ids.length - 1) * partnerSpacing);
  });

  for (let generation = 1; generation <= maxGeneration; generation += 1) {
    const generationNodeIds = nodeIdsByGeneration.get(generation) ?? [];
    const generationUnits = buildPartnerUnits(
      generationNodeIds,
      generation,
      nodesById,
      partnerIdsByPersonId,
      generationById,
    );

    const descriptors = generationUnits.map((unit) => {
      const xTargets: number[] = [];
      const zTargets: number[] = [];

      unit.ids.forEach((id) => {
        const parentIds = parentIdsByChildId.get(id) ?? [];
        if (parentIds.length > 0) {
          xTargets.push(
            average(
              parentIds
                .map((parentId) => xById.get(parentId))
                .filter((x): x is number => x !== undefined),
            ),
          );

          const familyGroup = familyGroupByChildId.get(id);
          const siblings = familyGroup?.childIds ?? [id];
          const siblingOffset =
            siblings.length > 1
              ? (siblings.indexOf(id) - (siblings.length - 1) / 2) * siblingDepthSpacing
              : 0;
          zTargets.push(
            average(
              parentIds
                .map((parentId) => zById.get(parentId))
                .filter((z): z is number => z !== undefined),
            ) + siblingOffset,
          );
        }
      });

      return {
        unit,
        targetX: xTargets.length > 0 ? average(xTargets) : 0,
        targetZ: zTargets.length > 0 ? average(zTargets) : 0,
      };
    });

    descriptors.sort((left, right) => left.targetX - right.targetX);

    let lastCenterX: number | null = null;
    descriptors.forEach((descriptor) => {
      let centerX = descriptor.targetX;
      if (lastCenterX !== null && centerX - lastCenterX < unitGap) {
        centerX = lastCenterX + unitGap;
      }
      lastCenterX = centerX;

      descriptor.unit.ids.forEach((id, memberIndex) => {
        xById.set(id, centerX + (memberIndex - (descriptor.unit.ids.length - 1) / 2) * partnerSpacing);
        zById.set(
          id,
          descriptor.targetZ +
            (memberIndex - (descriptor.unit.ids.length - 1) / 2) * partnerDepthSpacing,
        );
      });
    });
  }

  const xOffset = average([...xById.values()]);
  const zOffset = average([...zById.values()]);

  xById.forEach((value, key) => {
    xById.set(key, value - xOffset);
  });
  zById.forEach((value, key) => {
    zById.set(key, value - zOffset);
  });

  const positions = new Map<string, Point3>();
  chunk.nodes.forEach((node) => {
    const generation = generationById.get(node.id) ?? 0;
    positions.set(node.id, [
      xById.get(node.id) ?? 0,
      (maxGeneration / 2 - generation) * generationGap,
      (generation - maxGeneration / 2) * generationDepthGap + (zById.get(node.id) ?? 0),
    ]);
  });

  const connectors: SceneConnector[] = [];
  const joints: SceneJoint[] = [];
  const familyPairKeys = new Set(
    familyGroups.filter((group) => group.parentIds.length > 1).map((group) => group.key),
  );

  familyGroups.forEach((group) => {
    const parentPositions = group.parentIds
      .map((parentId) => positions.get(parentId))
      .filter((point): point is Point3 => Boolean(point))
      .sort((left, right) => left[0] - right[0]);
    const childPositions = group.childIds
      .map((childId) => positions.get(childId))
      .filter((point): point is Point3 => Boolean(point))
      .sort((left, right) => left[0] - right[0]);

    if (childPositions.length === 0) {
      return;
    }

    const parentCenter = parentPositions.length > 0 ? averagePoint(parentPositions) : averagePoint(childPositions);
    const parentY = parentPositions.length > 0 ? average(parentPositions.map((point) => point[1])) : childPositions[0][1] + generationGap;
    const jointPoint: Point3 = [parentCenter[0], parentY - generationGap * 0.55, parentCenter[2]];

    joints.push({
      key: `family-${group.key}`,
      position: jointPoint,
      color: "#f3d29e",
      scale: childPositions.length > 1 ? 0.1 : 0.08,
    });

    if (parentPositions.length === 2) {
      connectors.push({
        key: `partner-bar-${group.key}`,
        points: [parentPositions[0], parentPositions[1]],
        color: "#f2cc8f",
        opacity: 0.76,
        lineWidth: 2.1,
      });
    }

    if (parentPositions.length === 1) {
      connectors.push({
        key: `single-parent-${group.key}`,
        points: [parentPositions[0], jointPoint],
        color: "#7aa7e8",
        opacity: 0.84,
        lineWidth: 2.2,
      });
    }

    if (parentPositions.length > 1) {
      const trunkStart: Point3 = [parentCenter[0], parentY, parentCenter[2]];
      connectors.push({
        key: `trunk-${group.key}`,
        points: [trunkStart, jointPoint],
        color: "#7aa7e8",
        opacity: 0.84,
        lineWidth: 2.25,
      });
    }

    if (childPositions.length === 1) {
      connectors.push({
        key: `child-drop-${group.key}`,
        points: [jointPoint, childPositions[0]],
        color: "#8eb8ff",
        opacity: 0.84,
        lineWidth: 2.25,
      });
      return;
    }

    const railY = childPositions[0][1] + generationGap * 0.35;
    const railStart: Point3 = [childPositions[0][0], railY, jointPoint[2]];
    const railEnd: Point3 = [childPositions[childPositions.length - 1][0], railY, jointPoint[2]];

    connectors.push({
      key: `trunk-to-rail-${group.key}`,
      points: [jointPoint, [jointPoint[0], railY, jointPoint[2]]],
      color: "#7aa7e8",
      opacity: 0.84,
      lineWidth: 2.2,
    });

    connectors.push({
      key: `child-rail-${group.key}`,
      points: [railStart, railEnd],
      color: "#8eb8ff",
      opacity: 0.8,
      lineWidth: 2.1,
    });

    childPositions.forEach((childPosition, index) => {
      const branchPoint: Point3 = [childPosition[0], railY, jointPoint[2]];
      connectors.push({
        key: `child-stem-${group.key}-${index}`,
        points: collapseDuplicatePoints([branchPoint, childPosition]),
        color: "#8eb8ff",
        opacity: 0.84,
        lineWidth: 2.2,
      });
    });
  });

  partnerPairKeys.forEach((pairKey) => {
    if (familyPairKeys.has(pairKey)) {
      return;
    }

    const [leftId, rightId] = pairKey.split("|");
    const leftPosition = positions.get(leftId);
    const rightPosition = positions.get(rightId);

    if (!leftPosition || !rightPosition) {
      return;
    }

    connectors.push({
      key: `standalone-partner-${pairKey}`,
      points: [leftPosition, rightPosition],
      color: "#f2cc8f",
      opacity: 0.72,
      lineWidth: 2.0,
    });
  });

  return {
    positions,
    connectors,
    joints,
    target: [0, 0, 0],
  };
}

function SceneNode({
  node,
  position,
  isSelected,
  onSelectPerson,
}: {
  node: PersonSummary;
  position: Point3;
  isSelected: boolean;
  onSelectPerson: (personId: string) => void;
}) {
  return (
    <mesh position={position} onClick={() => onSelectPerson(node.id)} castShadow receiveShadow>
      <sphereGeometry args={[isSelected ? 0.42 : 0.32, 36, 36]} />
      <meshPhysicalMaterial
        color={nodeColor(node, isSelected)}
        emissive={isSelected ? "#69360f" : "#10222d"}
        roughness={isSelected ? 0.25 : 0.35}
        metalness={isSelected ? 0.25 : 0.12}
        clearcoat={0.1}
        clearcoatRoughness={0.4}
      />
    </mesh>
  );
}

export function CanonicalGenealogyScene({
  chunk,
  selectedPersonId,
  onSelectPerson,
}: CanonicalGenealogySceneProps) {
  const layout = buildSceneLayout(chunk);

  return (
    <div className="sceneCanvasShell">
      <Canvas camera={{ position: [10, 8, 20], fov: 32 }} shadows>
        <color attach="background" args={["#140f14"]} />
        <fog attach="fog" args={["#140f14", 22, 48]} />
        <ambientLight intensity={0.68} />
        <directionalLight
          position={[10, 14, 12]}
          intensity={1.28}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-radius={8}
        />
        <pointLight position={[-8, 3, 14]} intensity={0.52} color="#89c2d9" />
        <pointLight position={[8, 2, -10]} intensity={0.36} color="#d4a574" />
        <gridHelper args={[48, 24, "#312b2f", "#211c21"]} position={[0, -8.5, 0]} />

        {layout.connectors.map((connector) => (
          <Line
            key={connector.key}
            points={connector.points}
            color={connector.color}
            lineWidth={connector.lineWidth}
            transparent
            opacity={connector.opacity}
          />
        ))}

        {layout.joints.map((joint) => (
          <mesh key={joint.key} position={joint.position} castShadow>
            <sphereGeometry args={[joint.scale, 22, 22]} />
            <meshPhysicalMaterial
              color={joint.color}
              emissive="#5a4125"
              roughness={0.3}
              metalness={0.12}
              clearcoat={0.05}
            />
          </mesh>
        ))}

        {chunk.nodes.map((node) => (
          <SceneNode
            key={node.id}
            node={node}
            position={layout.positions.get(node.id) ?? [0, 0, 0]}
            isSelected={selectedPersonId === node.id}
            onSelectPerson={onSelectPerson}
          />
        ))}

        <OrbitControls
          target={layout.target}
          enableDamping
          dampingFactor={0.08}
          enablePan={false}
          minDistance={14}
          maxDistance={32}
          minPolarAngle={Math.PI / 3.2}
          maxPolarAngle={Math.PI / 1.8}
          minAzimuthAngle={-Math.PI / 2.5}
          maxAzimuthAngle={Math.PI / 2.5}
        />
      </Canvas>
    </div>
  );
}
