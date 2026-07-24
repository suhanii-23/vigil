"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import type { Group } from "three";

/**
 * Chunky, rounded robot — original design, styled loosely after friendly
 * "AI assistant" robot characters generally (rounded chamfered shell, dark
 * visor face), built from primitives with RoundedBox for the soft toy-like
 * corners a plain BoxGeometry can't give.
 *
 * Head is a real volumetric group parented at the neck, so rotating it
 * pivots naturally at the neck joint — no flat-plane offset math needed
 * (that trick was only necessary for the flat-image version).
 */

const SHELL_COLOR = "#e8e6e0";
const VISOR_COLOR = "#1a1a1e";

function Visor() {
  return (
    <group position={[0, 0.02, 0.42]}>
      {/* Dark screen */}
      <RoundedBox args={[0.62, 0.5, 0.08]} radius={0.08} smoothness={4}>
        <meshStandardMaterial color={VISOR_COLOR} roughness={0.3} metalness={0.1} />
      </RoundedBox>
      {/* Eyes */}
      <mesh position={[-0.13, 0.02, 0.05]}>
        <sphereGeometry args={[0.055, 20, 20]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0.13, 0.02, 0.05]}>
        <sphereGeometry args={[0.055, 20, 20]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

function Head({ headRef }: { headRef: React.RefObject<Group> }) {
  return (
    <group ref={headRef} position={[0, 0.78, 0]}>
      <RoundedBox args={[0.95, 0.85, 0.75]} radius={0.18} smoothness={4} castShadow>
        <meshStandardMaterial color={SHELL_COLOR} roughness={0.55} metalness={0.05} />
      </RoundedBox>
      <Visor />
      {/* Side node detail */}
      <mesh position={[0.5, -0.05, 0]}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial color={SHELL_COLOR} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Limb({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <capsuleGeometry args={[0.12, 0.4, 4, 12]} />
        <meshStandardMaterial color={SHELL_COLOR} roughness={0.55} />
      </mesh>
      <mesh position={[0, -0.32, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color="#c9c6bd" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Body() {
  return (
    <group position={[0, 0.02, 0]}>
      {/* Neck */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.14, 0.16, 0.16, 16]} />
        <meshStandardMaterial color="#c9c6bd" roughness={0.6} />
      </mesh>
      {/* Torso */}
      <RoundedBox args={[0.85, 0.75, 0.6]} radius={0.2} smoothness={4} position={[0, -0.15, 0]} castShadow>
        <meshStandardMaterial color={SHELL_COLOR} roughness={0.55} />
      </RoundedBox>
      {/* Arms */}
      <Limb position={[-0.55, -0.15, 0]} />
      <Limb position={[0.55, -0.15, 0]} />
      {/* Legs */}
      <mesh position={[-0.2, -0.75, 0]} castShadow>
        <capsuleGeometry args={[0.11, 0.3, 4, 12]} />
        <meshStandardMaterial color={SHELL_COLOR} roughness={0.55} />
      </mesh>
      <mesh position={[0.2, -0.75, 0]} castShadow>
        <capsuleGeometry args={[0.11, 0.3, 4, 12]} />
        <meshStandardMaterial color={SHELL_COLOR} roughness={0.55} />
      </mesh>
      {/* Feet */}
      <RoundedBox args={[0.22, 0.14, 0.3]} radius={0.05} position={[-0.2, -0.98, 0.04]} castShadow>
        <meshStandardMaterial color="#c9c6bd" roughness={0.6} />
      </RoundedBox>
      <RoundedBox args={[0.22, 0.14, 0.3]} radius={0.05} position={[0.2, -0.98, 0.04]} castShadow>
        <meshStandardMaterial color="#c9c6bd" roughness={0.6} />
      </RoundedBox>
      {/* Pedestal */}
      <RoundedBox args={[1.3, 0.16, 1.0]} radius={0.04} position={[0, -1.14, 0]} receiveShadow>
        <meshStandardMaterial color="#232326" roughness={0.4} />
      </RoundedBox>
    </group>
  );
}

function Rig() {
  const headRef = useRef<Group>(null!);
  const groupRef = useRef<Group>(null!);
  const { pointer } = useThree();
  const current = useRef({ x: 0, y: 0 });

  useFrame((state) => {
    const targetY = pointer.x * 0.45;
    const targetX = -pointer.y * 0.22;
    current.current.x += (targetX - current.current.x) * 0.08;
    current.current.y += (targetY - current.current.y) * 0.08;
    if (headRef.current) {
      headRef.current.rotation.x = current.current.x;
      headRef.current.rotation.y = current.current.y;
    }
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.1) * 0.05;
    }
  });

  return (
    <group ref={groupRef}>
      <Head headRef={headRef} />
      <Body />
    </group>
  );
}

export default function CharacterScene3D() {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Canvas
        camera={{ position: [0.3, 0.0, 4.6], fov: 34 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        shadows
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 3]} intensity={1.1} castShadow />
        <directionalLight position={[-2, 1, -1]} intensity={0.3} />
        <Suspense fallback={null}>
          <Rig />
        </Suspense>
      </Canvas>
    </div>
  );
}
