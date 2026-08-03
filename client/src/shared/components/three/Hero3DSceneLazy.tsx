"use client";

import dynamic from "next/dynamic";

/**
 * Client-only lazy wrapper for the 3D hero.
 *
 * `ssr: false` is only allowed inside a Client Component, so this wrapper owns
 * the `next/dynamic` call while server components import this module normally.
 * The underlying scene degrades gracefully to a static gradient fallback on
 * reduced-motion and low-end devices (see Hero3DScene).
 */
const Hero3DScene = dynamic(() => import("./Hero3DScene"), {
  ssr: false,
  loading: () => null,
});

export default function Hero3DSceneLazy() {
  return <Hero3DScene />;
}
