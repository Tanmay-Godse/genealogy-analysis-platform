"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Line } from "@react-three/drei";

import type { GraphChunk, PersonSummary } from "@/lib/api";

type CanonicalGenealogySceneProps = {
  chunk: GraphChunk;
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
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

function SceneNode({
  node,
  isSelected,
  onSelectPerson,
}: {
  node: PersonSummary;
  isSelected: boolean;
  onSelectPerson: (personId: string) => void;
}) {
  return (
    <mesh
      position={node.coordinate}
      onClick={() => onSelectPerson(node.id)}
      castShadow
      receiveShadow
    >
      <sphereGeometry args={[isSelected ? 0.42 : 0.32, 32, 32]} />
      <meshStandardMaterial
        color={nodeColor(node, isSelected)}
        emissive={isSelected ? "#69360f" : "#10222d"}
        roughness={0.28}
        metalness={0.2}
      />
    </mesh>
  );
}

export function CanonicalGenealogyScene({
  chunk,
  selectedPersonId,
  onSelectPerson,
}: CanonicalGenealogySceneProps) {
  const nodesById = new Map(chunk.nodes.map((node) => [node.id, node]));

  return (
    <div className="sceneCanvasShell">
      <Canvas camera={{ position: [0, 1.5, 13], fov: 42 }} shadows>
        <color attach="background" args={["#140f14"]} />
        <fog attach="fog" args={["#140f14", 12, 28]} />
        <ambientLight intensity={0.85} />
        <directionalLight
          position={[8, 10, 6]}
          intensity={1.25}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <pointLight position={[-6, 5, -3]} intensity={0.5} color="#89c2d9" />

        <gridHelper args={[24, 12, "#3d3531", "#282320"]} position={[0, -5.2, 0]} />

        {chunk.relationships.map((relationship) => {
          const source = nodesById.get(relationship.sourceId);
          const target = nodesById.get(relationship.targetId);

          if (!source || !target) {
            return null;
          }

          return (
            <Line
              key={relationship.id}
              points={[source.coordinate, target.coordinate]}
              color={relationship.kind === "partner_of" ? "#f2cc8f" : "#6ea8fe"}
              lineWidth={2}
              transparent
              opacity={0.56}
            />
          );
        })}

        {chunk.nodes.map((node) => (
          <SceneNode
            key={node.id}
            node={node}
            isSelected={selectedPersonId === node.id}
            onSelectPerson={onSelectPerson}
          />
        ))}

        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          minDistance={7}
          maxDistance={22}
          maxPolarAngle={Math.PI / 1.8}
        />
      </Canvas>
    </div>
  );
}
