# Master Prompt — Premium 2026 SaaS Frontend (Three.js + GSAP Edition)

> Paste this entire prompt into your code-generation tool (Claude Code, Cursor, etc.)
> from the root of your `client/` folder. It is written against your **actual existing
> structure** (`src/app`, `src/modules/<feature>`, `src/shared`) — this prompt is
> focused specifically on visual/motion generation, not architecture, and every file
> path below matches where things already live in your repo.

---

You are a Senior Frontend Engineer and Motion/Creative Developer with deep expertise in award-winning ("Awwwards-tier") SaaS product design — the kind of visual quality seen in Linear, Stripe, Vercel, Framer, Raycast, Supabase, Clerk, and Lusion.co.

I already have an existing frontend project set up (Next.js App Router, TypeScript, Tailwind CSS) with this structure:

```
client/src/
├── app/                    # Routing only — thin pages, no business logic
│   ├── appointments/
│   ├── billing/
│   ├── chat/
│   ├── dashboard/
│   ├── patients/
│   ├── layout.tsx
│   ├── page.tsx            # Root/landing page
│   └── provider.tsx        # App-wide providers (theme, query client, etc.)
├── modules/                # Feature-scoped logic
│   └── <feature>/
│       ├── component/
│       ├── constant/
│       ├── hooks/
│       ├── page/
│       └── services/
└── shared/                 # Cross-feature reusable code
    ├── components/
    ├── config/
    ├── lib/
    ├── services/
    ├── store/
    └── types/
```

Do NOT restructure my folders, rename anything, or touch `shared/services`, `shared/store`, `modules/*/services`, or any backend/API logic. Work only within this existing structure, adding new files in the locations specified in the Deliverables section below.

Your task: generate a **premium, "today's generation" SaaS frontend experience** for this application, with the following four pillars as non-negotiable requirements.

---

## 1. Three.js (via React Three Fiber)

- Use `@react-three/fiber` + `@react-three/drei` — never raw Three.js imperative code inside React components.
- Build a hero-section 3D scene: an abstract, brand-colored geometric object (e.g., a distorted icosahedron, wireframe torus, or particle field) that:
  - Idles with a slow, continuous rotation (never fully static).
  - Reacts subtly to mouse movement (parallax tilt, max ~8–10 degrees — nothing disorienting).
  - Uses `MeshDistortMaterial` or a custom shader for an organic, "liquid glass" surface feel.
- Add a lightweight particle/starfield background layer (very low opacity, `<Points>` from drei) behind key sections for depth — must not compete with foreground text.
- **Performance guardrails (mandatory):**
  - Lazy-load the 3D canvas with `next/dynamic` (`ssr: false`), rendered only after the hero section is in viewport.
  - Cap pixel ratio (`gl={{ antialias: true }}` + `dpr={[1, 2]}`), pause the render loop (`frameloop="demand"` or pause on tab-blur) when off-screen.
  - Provide a static gradient/image fallback for reduced-motion users and low-end devices (`prefers-reduced-motion` and a basic WebGL-support check).
  - The 3D scene is a hero/landing embellishment only — never block interaction with real product data or forms.

## 2. GSAP Animation System

- Use GSAP with `@gsap/react`'s `useGSAP()` hook — never raw `gsap.to()` calls outside a proper cleanup context.
- Implement with **ScrollTrigger**:
  - Scroll-pinned hero section with a staggered text reveal (headline splits into words/chars via `SplitText`-style logic, animating up with a slight blur-to-sharp transition).
  - Section-by-section fade + slide-up reveal as the user scrolls (staggered children, `y: 40 → 0`, `opacity: 0 → 1`, `ease: "power3.out"`).
  - Horizontal-scroll or pinned feature showcase for a "product tour" section, if applicable.
- Implement a GSAP-powered page-transition layer (works alongside Framer Motion for component-level micro-interactions — GSAP owns scroll/timeline choreography, Framer Motion owns discrete UI-state transitions like modals/dropdowns; do not let them fight over the same element).
- Micro-interactions: magnetic buttons (cursor-follow effect within a bounded radius), animated underlines on nav links, number count-up on stat cards using GSAP's `gsap.to(obj, { value: target })` pattern.
- All GSAP timelines must respect `prefers-reduced-motion` (skip to end state instantly rather than disabling functionality).

## 3. Premium Typography

- Load via `next/font` (self-hosted, zero layout shift):
  - **Display/Headings:** Geist Sans or Clash Display — bold, confident, tight tracking (`tracking-tight`) at large sizes.
  - **Body/UI:** Inter or Plus Jakarta Sans — variable font, 400/500/600 weights only in the UI.
  - **Monospace accent:** Geist Mono or JetBrains Mono — reserved for IDs, code, timestamps, and small "eyebrow" labels above headlines for a technical/premium feel.
- Fluid type scale using `clamp()` (via Tailwind's arbitrary values or a custom plugin) so headline sizes scale smoothly between mobile and ultra-wide, not just at fixed breakpoints.
- Generous line-height on body copy (1.6–1.7), tight line-height on display headings (1.05–1.15).

## 4. Color Gradients

- Define a signature two-to-three-stop brand gradient (e.g., deep blue → violet → soft cyan) as a CSS custom property, not a one-off Tailwind class, so it's reusable across buttons, borders, and text.
- Apply it with restraint and intent:
  - **Gradient text** on the hero headline's key word(s) only (`background-clip: text`), never the entire heading.
  - **Gradient borders** on premium/CTA cards via a `padding-box`/`border-box` double-background trick, animated to slowly shift on hover.
  - **Mesh/aurora background glow** — large, blurred, low-opacity (8–15%) gradient blobs positioned behind hero/CTA sections using `blur-3xl` and `animate-pulse`-style slow drift, never full-opacity color washes.
  - **Gradient buttons** for primary CTAs only — secondary/tertiary buttons stay solid or outline, so the gradient stays meaningful as a visual hierarchy signal, not decoration everywhere.
- Full light/dark theme support: gradients get a distinct, separately-tuned stop set for dark mode (higher luminance, slightly desaturated) rather than the same gradient with an opacity flip.

---

## Additional Requirements (carried over from base stack)

- Tailwind CSS v4 + shadcn/ui for all standard UI primitives — the above four pillars enhance, not replace, the existing component library.
- Framer Motion remains responsible for component-level transitions (modals, dropdowns, list reordering, page-route fades); GSAP owns scroll-driven and hero choreography as scoped above.
- Skeleton loading states for all async content — no spinners as the primary loading pattern.
- Full responsiveness: the 3D scene and pinned scroll sections must degrade gracefully on mobile (simplify or replace the 3D canvas with a static gradient hero below `md` breakpoint if performance testing shows jank).
- WCAG AA accessibility maintained throughout — motion-heavy sections must have working reduced-motion fallbacks, and no gradient-text-on-gradient-background combination should drop below 4.5:1 contrast for surrounding body copy.

---

## Deliverables — with exact file placement

Generate, in this order, in these exact locations:

1. **Font setup**
   `src/shared/config/fonts.ts` — `next/font` configuration (Geist Sans, Inter/Plus Jakarta Sans, Geist Mono), exported as reusable font variable objects. Import and wire the resulting `className`/CSS variables onto the `<html>` or `<body>` tag inside `src/app/layout.tsx` only — don't touch anything else in that file.

2. **Design tokens**
   Add the gradient CSS custom properties (light + dark stop sets) to the existing `src/app/globals.css`, under `:root` and `.dark`. Extend `tailwind.config`/the Tailwind v4 `@theme` block at the project root to expose them as utility classes (e.g., `bg-gradient-brand`, `text-gradient-brand`).

3. **`<Hero3DScene />`**
   `src/shared/components/three/Hero3DScene.tsx` — React Three Fiber component, `next/dynamic` lazy-loaded, with a `Hero3DSceneFallback` static-gradient component in the same folder for reduced-motion/low-end devices.

4. **`<AnimatedHero />`**
   `src/shared/components/motion/AnimatedHero.tsx` — GSAP + ScrollTrigger headline/section reveal wrapper, built with `useGSAP()`, accepting children so it can wrap any section.

5. **`<MagneticButton />`**
   `src/shared/components/motion/MagneticButton.tsx` — reusable GSAP magnetic-hover button, built on top of the existing shadcn `Button` if one exists in `src/shared/components/ui`, otherwise as a standalone styled button.

6. **`<GradientText />` and `<GradientBorderCard />`**
   `src/shared/components/gradient/GradientText.tsx` and `src/shared/components/gradient/GradientBorderCard.tsx` — reusable primitives consuming the tokens from Step 2.

7. **Landing page wiring**
   Update `src/app/page.tsx` (root landing page) to compose the above: `<Hero3DScene />` behind the fold, `<AnimatedHero />` wrapping the headline/CTA section, `<GradientText />` on the key headline word, `<GradientBorderCard />` on any pricing/feature cards present. Do not touch `dashboard/`, `appointments/`, `billing/`, `chat/`, or `patients/` routes — those are internal product screens, not the marketing/landing surface this visual layer targets.

8. **Types (if needed)**
   Any shared prop types for the new components go in `src/shared/types/`, following whatever naming convention is already used there.

9. **Integration note**
   End with a short note listing the exact npm packages to install (`three`, `@react-three/fiber`, `@react-three/drei`, `gsap`, `@gsap/react`) and confirming no files outside `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, and new files under `src/shared/components/` were touched.

Do not invent backend logic, API calls, or data. Do not modify `modules/`, `shared/services`, `shared/store`, `shared/lib`, or any auth/business-logic files. Do not modify `AGENTS.md` or `CLAUDE.md`. This is a visual/motion layer added on top of the existing application only.
