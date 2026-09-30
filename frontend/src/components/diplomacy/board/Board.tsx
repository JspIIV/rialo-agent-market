"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, OrbitControls, PerspectiveCamera, Stars } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import type { World } from "@/lib/diplomacy/engine";
import Island from "./Island";
import { Hub, ParticleField, TreatyArc } from "./effects";
import { KIND_COLOR, buildLayouts, islandTopY, type VisualStatus } from "./world";

export interface BoardProps {
  world: World;
  statusOf: (id: string) => VisualStatus;
  busyTreaties: Set<number>;
  escrow: number;
  hoveredId: string | null;
  selectedId: string | null;
  focusId: string | null;
  selectedTreaty: number | null;
  showLabels: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onSelectTreaty: (id: number) => void;
}

// Flies the camera to the focused citadel, then hands control back to the
// user the moment they drag or zoom.
function CameraRig({ camPos, target, flyKey }: { camPos: [number, number, number]; target: [number, number, number]; flyKey: string }) {
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3; update: () => void;
    addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void;
  } | null;
  const camera = useThree((s) => s.camera);
  const wantPos = useRef(new THREE.Vector3(...camPos));
  const wantTarget = useRef(new THREE.Vector3(...target));
  const flying = useRef(true);
  const grabbed = useRef(false);

  useEffect(() => {
    wantPos.current.set(...camPos);
    wantTarget.current.set(...target);
    flying.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyKey]);

  useEffect(() => {
    if (!controls) return;
    const start = () => { grabbed.current = true; flying.current = false; };
    const end = () => { grabbed.current = false; };
    controls.addEventListener("start", start);
    controls.addEventListener("end", end);
    return () => { controls.removeEventListener("start", start); controls.removeEventListener("end", end); };
  }, [controls]);

  useFrame((_, dt) => {
    if (!controls || !flying.current || grabbed.current) return;
    // Time-based easing, so a slow frame rate still arrives in the same time.
    const k = 1 - Math.exp(-dt * 4);
    camera.position.lerp(wantPos.current, k);
    controls.target.lerp(wantTarget.current, k);
    controls.update();
    if (camera.position.distanceTo(wantPos.current) < 0.4 && controls.target.distanceTo(wantTarget.current) < 0.4) flying.current = false;
  });
  return null;
}

function Cursor({ on }: { on: boolean }) {
  useEffect(() => {
    document.body.style.cursor = on ? "pointer" : "auto";
    return () => { document.body.style.cursor = "auto"; };
  }, [on]);
  return null;
}

// Phones get a wider overview so the outer islands are not cropped.
const OVERVIEW: [number, number, number] =
  typeof window !== "undefined" && window.innerWidth < 640 ? [70, 66, 70] : [46, 44, 46];

export default function Board(p: BoardProps) {
  const layouts = useMemo(() => buildLayouts(p.world.enclaves), [p.world.enclaves]);
  const byId = useMemo(() => new Map(layouts.map(l => [l.id, l])), [layouts]);
  const tops = useMemo(() => new Map(layouts.map(l => [l.id, new THREE.Vector3(l.x, islandTopY(l.floatY) + 2.6, l.z)])), [layouts]);

  const { camPos, target } = useMemo(() => {
    const l = p.focusId ? byId.get(p.focusId) : undefined;
    if (!l) return { camPos: OVERVIEW, target: [0, 0, 0] as [number, number, number] };
    const y = islandTopY(l.floatY);
    return { camPos: [l.x + 15, y + 13, l.z + 15] as [number, number, number], target: [l.x, y, l.z] as [number, number, number] };
  }, [p.focusId, byId]);

  // Pinned so a re-render never resets the user's orbit.
  const initialPos = useMemo<[number, number, number]>(() => OVERVIEW, []);
  const initialTarget = useMemo<[number, number, number]>(() => [0, 0, 0], []);
  const focus = p.hoveredId ?? p.selectedId;
  const live = p.world.treaties.filter(t => t.status === "proposed" || t.status === "active");
  const treatyCount = (id: string) => live.filter(t => t.status === "active" && (t.partyA === id || t.partyB === id)).length;

  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="absolute inset-0">
      <Cursor on={p.hoveredId !== null} />
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }} onPointerMissed={() => p.onSelect(null)}>
        <color attach="background" args={["#060606"]} />
        <fogExp2 attach="fog" args={["#060606", 0.0016]} />
        <PerspectiveCamera makeDefault position={initialPos} fov={45} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.06} zoomSpeed={0.7} minDistance={10} maxDistance={130}
          minPolarAngle={0.12} maxPolarAngle={Math.PI / 2.2} target={initialTarget} />
        <CameraRig camPos={camPos} target={target} flyKey={p.focusId ?? "overview"} />

        <ambientLight intensity={0.6} />
        <hemisphereLight args={["#f2ce84", "#0a0a0a", 0.45]} />
        <directionalLight position={[0, 50, 20]} intensity={0.7} />
        <directionalLight position={[30, 40, 20]} intensity={1.1} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048}
          shadow-camera-far={160} shadow-camera-left={-70} shadow-camera-right={70} shadow-camera-top={70} shadow-camera-bottom={-70} />
        <pointLight position={[-40, 18, -32]} intensity={30} distance={90} color="#a78bfa" />
        <pointLight position={[40, 16, 32]} intensity={30} distance={90} color="#38bdf8" />

        <Suspense fallback={null}>
          <Stars radius={150} depth={70} count={2400} factor={3} saturation={0} fade speed={0.5} />
          <ParticleField />
          <Grid position={[0, -1.85, 0]} args={[10, 10]} infiniteGrid cellSize={2} cellThickness={0.6} cellColor="#1c1c1c"
            sectionSize={10} sectionThickness={1} sectionColor="#4a3d22" fadeDistance={150} fadeStrength={2.5} />

          <Hub escrow={p.escrow} reserves={p.world.reserves} showLabel={p.showLabels} />

          {p.world.enclaves.map(e => {
            const l = byId.get(e.id);
            if (!l) return null;
            return (
              <Island key={e.id} enclave={e} layout={l} status={p.statusOf(e.id)} treatyCount={treatyCount(e.id)}
                active={e.id === p.hoveredId || e.id === p.selectedId} isYours={e.owner === "you"} showLabel={p.showLabels}
                onHover={p.onHover} onSelect={p.onSelect} />
            );
          })}

          {live.map(t => {
            const a = tops.get(t.partyA);
            const b = tops.get(t.partyB);
            if (!a || !b) return null;
            const opacity = !focus ? 0.55 : focus === t.partyA || focus === t.partyB ? 1 : 0.15;
            return (
              <TreatyArc key={t.id} a={a} b={b} color={KIND_COLOR[t.kind]} opacity={t.id === p.selectedTreaty ? 1 : opacity}
                selected={t.id === p.selectedTreaty} pending={t.status === "proposed"} busy={p.busyTreaties.has(t.id)}
                onSelect={() => p.onSelectTreaty(t.id)} />
            );
          })}

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.8, 0]} receiveShadow>
            <planeGeometry args={[220, 220]} />
            <shadowMaterial transparent opacity={0.3} />
          </mesh>

          <EffectComposer>
            <Bloom luminanceThreshold={0.25} intensity={1.2} luminanceSmoothing={0.9} mipmapBlur />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}
