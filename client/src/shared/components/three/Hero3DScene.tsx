"use client";

import * as React from "react";
import type * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Points, PointMaterial } from "@react-three/drei";

// Star positions computed once at module scope (avoids Math.random in render).
const STAR_POSITIONS = (() => {
  const count = 900;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = (Math.random() - 0.5) * 14;
    arr[i * 3 + 1] = (Math.random() - 0.5) * 9;
    arr[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2;
  }
  return arr;
})();

/** Rotating distorted icosahedron core with mouse parallax tilt. */
function DistortedCore() {
  const group = React.useRef<THREE.Group>(null);
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 });

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      setTilt({ x: ny * 0.12, y: nx * 0.12 });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useFrame((state, delta) => {
    if (!group.current) return;
    group.current.rotation.x += delta * 0.12;
    group.current.rotation.y += delta * 0.16;
    group.current.rotation.x += (tilt.x - Math.sin(state.clock.elapsedTime * 0.4) * 0.08) * 0.02;
    group.current.rotation.y += (tilt.y - Math.cos(state.clock.elapsedTime * 0.4) * 0.1) * 0.02;
  });

  return (
    <group ref={group}>
      <Float speed={1.4} rotationIntensity={0.4} floatIntensity={0.8}>
        <mesh scale={1.6}>
          <icosahedronGeometry args={[1, 4]} />
          <MeshDistortMaterial color="#2563eb" emissive="#1e40af" emissiveIntensity={0.45} roughness={0.15} metalness={0.65} distort={0.35} speed={1.6} />
        </mesh>
        <mesh scale={2.6}>
          <icosahedronGeometry args={[1, 1]} />
          <meshBasicMaterial color="#60a5fa" wireframe transparent opacity={0.12} />
        </mesh>
      </Float>
    </group>
  );
}

/** Low-opacity particle field for depth — never competes with foreground text. */
function Starfield() {
  return (
    <Points positions={STAR_POSITIONS} stride={3} frustumCulled>
      <PointMaterial transparent color="#60a5fa" size={0.02} sizeAttenuation depthWrite={false} opacity={0.5} />
    </Points>
  );
}

/**
 * Lazy-loaded hero 3D scene with performance guardrails:
 * - WebGL support check with static-gradient fallback
 * - dpr cap [1, 2]
 * - prefers-reduced-motion → static fallback (never disables content)
 * - mounts the Canvas only once the hero enters the viewport
 */
export default function Hero3DScene() {
  // WebGL capability is determined once, lazily (client-only component via next/dynamic ssr:false).
  const [supported] = React.useState<boolean | null>(() => {
    if (typeof window === "undefined") return false;
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (gl && "getExtension" in gl && typeof gl.getExtension === "function") gl.getExtension("WEBGL_lose_context")?.loseContext();
      return !!gl;
    } catch {
      return false;
    }
  });
  const [inView, setInView] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "100px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const prefersReduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div ref={containerRef} className="absolute inset-0">
      {supported === true && inView && !prefersReduced ? (
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          camera={{ position: [0, 0, 5], fov: 45 }}
          className="!absolute inset-0"
          style={{ pointerEvents: "none" }}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[4, 6, 5]} intensity={1.4} />
          <pointLight position={[-4, -2, 3]} intensity={0.8} color="#38bdf8" />
          <Starfield />
          <DistortedCore />
        </Canvas>
      ) : (
        <Hero3DSceneFallback />
      )}
    </div>
  );
}

/** Static gradient fallback for reduced-motion users and low-end devices. */
export function Hero3DSceneFallback({ className }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}>
      <div className="absolute inset-0 bg-gradient-brand-soft" />
      <div className="animate-aurora absolute -top-24 -left-24 size-[28rem] rounded-full bg-[radial-gradient(circle_at_center,var(--glow-primary),transparent_65%)] blur-3xl" />
      <div className="animate-aurora absolute -right-24 -bottom-24 size-[28rem] rounded-full bg-[radial-gradient(circle_at_center,var(--glow-cyan),transparent_65%)] blur-3xl" style={{ animationDelay: "-4s" }} />
    </div>
  );
}
