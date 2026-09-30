"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, Instance, Instances } from "@react-three/drei";
import type { Archetype, Enclave } from "@/lib/diplomacy/engine";
import {
  BIOME_BY_ARCHETYPE, STATUS_COLOR, STATUS_LABEL, VOXEL_H, generateIslandTiles, islandTopY,
  type IslandLayout, type VisualStatus,
} from "./world";
import { ContainmentGrid, DisputeDome } from "./effects";

interface Props {
  enclave: Enclave;
  layout: IslandLayout;
  status: VisualStatus;
  treatyCount: number;
  active: boolean;
  isYours: boolean;
  showLabel: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

function tileColor(height: number, radius: number, base: string, ridge: string, status: VisualStatus) {
  const c = new THREE.Color(base).lerp(new THREE.Color(ridge), Math.min(1, height / (radius + 3)));
  if (status === "sanctioned") c.lerp(new THREE.Color("#ef4444"), 0.22).multiplyScalar(0.55);
  else if (status === "contested") c.lerp(new THREE.Color("#f59e0b"), 0.14);
  return c.multiplyScalar(0.72 + height * 0.06);
}

// Each archetype gets its own citadel silhouette, so the board can be read at
// a glance. Height grows with reputation.
function Citadel({ archetype, accent, statusColor, reputation, active }: {
  archetype: Archetype; accent: string; statusColor: string; reputation: number; active: boolean;
}) {
  const crown = useRef<THREE.Group>(null);
  const lift = 0.7 + reputation / 100;
  useFrame((s) => {
    if (!crown.current) return;
    crown.current.rotation.y = s.clock.elapsedTime * 0.6;
    crown.current.position.y = 2.6 * lift + Math.sin(s.clock.elapsedTime * 1.6) * 0.12;
  });
  const stone = <meshStandardMaterial color="#1a1a1f" roughness={0.6} metalness={0.5} />;
  const glow = <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={active ? 2.4 : 1.5} />;

  return (
    <group>
      {archetype === "Oracle Collective" && (
        <>
          <mesh position={[0, 1.1 * lift, 0]} castShadow><cylinderGeometry args={[0.35, 0.8, 2.2 * lift, 6]} />{stone}</mesh>
          <mesh position={[0, 1.8 * lift, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.9, 0.06, 8, 32]} />{glow}</mesh>
        </>
      )}
      {archetype === "Liquidity Nexus" && (
        <>
          <mesh position={[0, 0.45 * lift, 0]} castShadow><cylinderGeometry args={[1.1, 1.2, 0.9 * lift, 8]} />{stone}</mesh>
          <mesh position={[0, 1.2 * lift, 0]} castShadow><cylinderGeometry args={[0.75, 0.85, 0.7 * lift, 8]} />{stone}</mesh>
          <mesh position={[0, 1.75 * lift, 0]}><cylinderGeometry args={[0.45, 0.5, 0.4 * lift, 8]} />{glow}</mesh>
        </>
      )}
      {archetype === "Autonomous Arbiter" && (
        <>
          {[1.2, 0.85, 0.5].map((w, i) => (
            <mesh key={i} position={[0, (0.3 + i * 0.6) * lift, 0]} castShadow>
              <boxGeometry args={[w * 2, 0.6 * lift, w * 2]} />{stone}
            </mesh>
          ))}
        </>
      )}
      {archetype === "Defense Vanguard" && (
        <>
          <mesh position={[0, 0.7 * lift, 0]} castShadow><boxGeometry args={[1.3, 1.4 * lift, 1.3]} />{stone}</mesh>
          {[[-0.85, -0.85], [0.85, -0.85], [0.85, 0.85], [-0.85, 0.85]].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.9 * lift, z]} castShadow><cylinderGeometry args={[0.22, 0.26, 1.8 * lift, 6]} />{stone}</mesh>
          ))}
          {[[-0.85, -0.85], [0.85, -0.85], [0.85, 0.85], [-0.85, 0.85]].map(([x, z], i) => (
            <mesh key={`g${i}`} position={[x, 1.85 * lift, z]}><boxGeometry args={[0.2, 0.2, 0.2]} />{glow}</mesh>
          ))}
        </>
      )}
      {/* Floating crystal: the sovereign's heartbeat, tinted by status. */}
      <group ref={crown}>
        <mesh>
          <octahedronGeometry args={[0.42, 0]} />
          <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={2.2} flatShading />
        </mesh>
      </group>
    </group>
  );
}

// A floating voxel island with the enclave's citadel on its plateau. Terrain
// and runes are two instanced meshes, so the whole archipelago stays cheap.
export default function Island({ enclave, layout, status, treatyCount, active, isYours, showLabel, onHover, onSelect }: Props) {
  const biome = BIOME_BY_ARCHETYPE[enclave.archetype];
  const statusColor = STATUS_COLOR[status];
  const tiles = useMemo(() => generateIslandTiles(layout.radius, enclave.seed), [layout.radius, enclave.seed]);
  const terrain = useMemo(() => tiles.map(t => {
    const h = t.height * VOXEL_H;
    return {
      key: `${t.dx}:${t.dz}`, x: layout.x + t.dx, z: layout.z + t.dz, y: layout.floatY + h / 2, h, top: layout.floatY + h,
      rune: t.rune, color: tileColor(t.height, layout.radius, biome.base, biome.ridge, status),
    };
  }), [tiles, layout, biome, status]);
  const bright = useMemo(() => terrain.map(t => t.color.clone().multiplyScalar(1.35)), [terrain]);
  const runes = useMemo(() => terrain.filter(t => t.rune), [terrain]);
  const baseY = islandTopY(layout.floatY);
  const lift = active ? 0.2 : 0;

  // Newly founded realms rise out of the void with a shockwave ring.
  const rise = useRef<THREE.Group>(null);
  const shock = useRef<THREE.Mesh>(null);
  const born = useRef(Date.now() - enclave.foundedAt < 4000);
  useFrame(() => {
    if (!born.current) return;
    const t = Math.min(1, (Date.now() - enclave.foundedAt) / 1600);
    const ease = 1 - Math.pow(1 - t, 3);
    if (rise.current) rise.current.position.y = -20 * (1 - ease);
    if (shock.current) {
      shock.current.scale.setScalar(1 + ease * layout.radius * 2.2);
      (shock.current.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.8;
    }
    if (t >= 1) born.current = false;
  });

  const hover = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(enclave.id); };
  const click = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(enclave.id); };

  return (
    <group ref={rise}>
      <mesh ref={shock} position={[layout.x, layout.floatY + 0.1, layout.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[layout.radius * 0.9, layout.radius * 1.02, 64]} />
        <meshBasicMaterial color={biome.accent} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Keel under the floating island */}
      <mesh position={[layout.x, layout.floatY - 1.6, layout.z]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[layout.radius * 0.85, 4.2, 6]} />
        <meshStandardMaterial color={new THREE.Color(biome.base).multiplyScalar(0.4)} roughness={0.9} flatShading />
      </mesh>
      <pointLight position={[layout.x, baseY + 3, layout.z]} color={biome.accent} intensity={active ? 14 : 8} distance={18} decay={2} />

      {/* Instance matrices are absolute world positions, so the mesh's own
          bounding sphere is meaningless: culling stays off (see Westphalia's
          ProceduralIsland for the full story). */}
      <Instances limit={terrain.length} range={terrain.length} frustumCulled={false} castShadow receiveShadow>
        <boxGeometry args={[0.96, 1, 0.96]} />
        <meshStandardMaterial roughness={0.5} metalness={0.3} />
        {terrain.map((t, i) => (
          <Instance key={t.key} position={[t.x, t.y + lift, t.z]} scale={[1, t.h, 1]} color={active ? bright[i] : t.color}
            onPointerOver={hover} onPointerOut={() => onHover(null)} onClick={click} />
        ))}
      </Instances>
      {runes.length > 0 && (
        <Instances limit={runes.length} range={runes.length} frustumCulled={false}>
          <boxGeometry args={[0.5, 0.08, 0.5]} />
          <meshStandardMaterial color={biome.accent} emissive={biome.accent} emissiveIntensity={2.4} />
          {runes.map(t => <Instance key={`r${t.key}`} position={[t.x, t.top + lift + 0.06, t.z]} />)}
        </Instances>
      )}

      <group position={[layout.x, baseY + lift, layout.z]} onPointerOver={hover} onPointerOut={() => onHover(null)} onClick={click}>
        <Citadel archetype={enclave.archetype} accent={biome.accent} statusColor={statusColor} reputation={enclave.reputation} active={active} />
        <TreatyMotes count={treatyCount} color={biome.accent} />
      </group>

      {status === "contested" && <DisputeDome position={[layout.x, baseY, layout.z]} nodes={5} />}
      {status === "sanctioned" && <ContainmentGrid position={[layout.x, baseY, layout.z]} />}

      {showLabel && (
        <Html center distanceFactor={28} position={[layout.x, baseY + 5.6, layout.z]} pointerEvents="none" zIndexRange={[0, 10]}>
          <div style={{
            fontFamily: "ui-monospace, SFMono-Regular, monospace", whiteSpace: "nowrap", textAlign: "center",
            userSelect: "none", pointerEvents: "none", background: "rgba(10,10,10,0.82)",
            border: `1px solid ${statusColor}66`, borderRadius: 4, padding: "4px 9px",
            boxShadow: `0 0 12px ${statusColor}33`, opacity: active ? 1 : 0.9,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: statusColor }}>
              {enclave.name.toUpperCase()}{isYours ? " ◆" : ""}
            </div>
            <div style={{ fontSize: 8, color: "#a3a3a3", letterSpacing: 1, marginTop: 2 }}>
              {STATUS_LABEL[status]} · REP {enclave.reputation} · {treatyCount} TREAT{treatyCount === 1 ? "Y" : "IES"}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// One orbiting mote per live treaty the enclave is party to.
function TreatyMotes({ count, color }: { count: number; color: string }) {
  const g = useRef<THREE.Group>(null);
  useFrame((s) => { if (g.current) g.current.rotation.y = s.clock.elapsedTime * 0.8; });
  if (count === 0) return null;
  return (
    <group ref={g} position={[0, 1.6, 0]}>
      {Array.from({ length: Math.min(count, 8) }).map((_, i, arr) => {
        const a = (i / arr.length) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 1.9, Math.sin(a * 2) * 0.25, Math.sin(a) * 1.9]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} />
          </mesh>
        );
      })}
    </group>
  );
}
