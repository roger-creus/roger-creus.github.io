# Black Hole Hero — Design Spec

**Date:** 2026-05-29
**Project:** roger-creus.github.io (personal academic portfolio)
**Goal:** Integrate the WebGL black hole from the (unreleased) `accretion-web` project into the personal site as a tasteful, impressive top-of-page element — with **zero Accretion branding or references**.

---

## 1. Summary

Add a **compact, full-width cosmic band** at the very top of the page (above the existing About section). The band renders the real Schwarzschild geodesic ray-traced black hole — pixel-identical to the accretion version — and carries Roger's name as the page masthead. The rest of the site is untouched.

The black hole is the same **GLSL fragment shader**, copied byte-for-byte, ported from React/Three.js to **dependency-free vanilla WebGL** so the site stays a no-build, drop-in-and-push static site on GitHub Pages.

---

## 2. Decisions (locked during brainstorming)

| Decision | Choice |
| --- | --- |
| Placement | Full-width band at the top, above About |
| Presence | **Compact** — `~34vh`, `min-height: 230px` (a masthead strip, not a full-screen takeover) |
| Render stack | **Vanilla WebGL** (WebGL1 / ESSL 1.00). No React, no Three.js, no build step, no new runtime dependencies |
| Fidelity | Shader copied **byte-for-byte** from `BlackHoleHero.tsx`. Only change: the Accretion product-sector hover logic is removed |
| Accretion references | **None.** No product names, no labels, no "Accretion" anywhere |
| Name placement | Appears **exactly once** — on the black hole band (serif, cream) with a gold rule + affiliation beneath |
| Nav | Name/brand removed from nav; section links **centered**. Transparent (cream) over the band, frosted-white (dark) once scrolled past it |
| Seam | Band fades from void `#07070a` → page `#fafafa` at its bottom edge |

---

## 3. Visual composition

```
┌─────────────────────────────────────────────┐
│        About · News · Publications · Projects │  ← nav: transparent, cream links, centered
│                                               │
│             ·  the black hole  ·              │  ← compact band (~34vh), live WebGL
│            Roger Creus Castanyer              │     name (serif, cream)
│            ──────────────                     │     gold rule
│       PHD STUDENT · MILA & UDEM               │     affiliation (uppercase, tracked)
│  ░░░░░░░░░ fade to #fafafa ░░░░░░░░░░░░░░░░░  │  ← cosmic→paper seam
├─────────────────────────────────────────────┤
│  [photo]    I am a PhD student at Mila …      │  ← existing About section, unchanged
│  email      Research / Interests / Experience │     (name + affiliation removed from sidebar)
│  socials                                      │
└─────────────────────────────────────────────┘
```

- **Intro reveal:** the 3.6s symmetric sine-eased wave sweep plays once on load (preserved from the original).
- **Ambient motion:** disk filaments drift; subtle brightness pulse. Camera is fixed.

---

## 4. Architecture

A no-build static site. Two units, clean boundaries:

### 4.1 `blackhole.js` (new file)
Self-contained, plain `<script src="blackhole.js">` (no modules/bundler). One IIFE that:
- Finds its target canvas (`#bh`).
- **Capability gate:** if `prefers-reduced-motion: reduce` **or** no WebGL context → do nothing; a CSS static fallback shows instead. (Never throws.)
- Compiles the vertex + fragment shaders, sets up a fullscreen-quad (`TRIANGLE_STRIP`, interleaved `position`+`uv`).
- Computes the **fixed camera basis** once in JS (`CAM = [44, 6.5, 0]`, `FOV = 38°`): `forward = normalize(-CAM)`, `right = normalize(forward × up)`, `up = normalize(right × forward)`; uploads `mat3[right, up, -forward]` (column-major) to `uCameraBasis`.
- Runs a `requestAnimationFrame` loop updating uniforms: `uTime`, `uIntroProgress` (0→1 over 3.6s, `0.5 - 0.5·cos(π·t)`), `uDiskRotation` (`+= dt·0.18`), `uPulse` (`1 + 0.05·sin(t·0.32)`).
- **Resize:** sizes the drawing buffer to `clientW/H × dpr` (dpr capped at 1.5 desktop / 1.0 mobile); updates `uResolution`, `uAspect`.
- **Performance:**
  - Mobile (`/Mobi|Android|iPhone|iPad|iPod/` or `≤640px`): integration steps `70`, dpr cap `1.0`.
  - Desktop: integration steps `110`.
  - One-shot adaptive quality: sample ~90 frames; if median frame time > 22ms, drop steps ×0.7 (floor 50) and dpr cap to 1.0.
  - Pause the rAF loop when the tab is hidden (`visibilitychange`) and when the band scrolls out of view (`IntersectionObserver`).

### 4.2 The shader (the crown jewel — copied verbatim)
Source: `accretion-web/src/components/BlackHoleHero.tsx`, the `fragmentShader` string. ESSL 1.00 compatible (uses `varying` / `gl_FragColor`), so it runs on WebGL1 everywhere.
**The only modification:** delete the product-sector logic — the `uActiveSector` and `uActiveStrength` uniforms and the `sectorBoost` block in `sampleDisk` — so the final line becomes `return baseCol * intensity * gFour * dFour * uPulse;`. Everything else (geodesic RK4 integrator, disk physics, Doppler beaming, blackbody color, gold tint, starfield, tone map) is unchanged. Physics constants unchanged: `M=1, R_S=2, R_ISCO=6, R_OUTER=22, R_ESCAPE=110, MAX_STEPS=220`.

### 4.3 `index.html` (edits)
- **Add the band** as the first element of the page (before `#about`):
  ```html
  <header class="hero-band" id="heroBand" aria-label="Roger Creus Castanyer">
    <canvas id="bh" aria-hidden="true"></canvas>
    <div class="hero-band__fade" aria-hidden="true"></div>
    <div class="hero-band__overlay">
      <h1 class="hero-band__name">Roger Creus Castanyer</h1>
      <span class="hero-band__rule"></span>
      <p class="hero-band__aff">PhD Student · Mila &amp; Université de Montréal</p>
    </div>
  </header>
  ```
  The name is the page's semantic `<h1>` (good for SEO/screen readers); the canvas is decorative (`aria-hidden`).
- **Nav:** remove the `.nav__brand` anchor; center `.nav__links`. Keep the existing IntersectionObserver active-link highlighting and the mobile burger/overlay menu.
- **About section:** remove the duplicate name (`.hero__name`) and affiliation (`.hero__affiliation`) from the sidebar. Keep the photo, email, and social icons; the bio/location/research/interests/experience content is unchanged.
- Load `blackhole.js` with a deferred `<script>` before `</body>`.

### 4.4 `main.css` (edits)
- Add palette vars to `:root`: `--void:#07070a; --cream:#f4ecd8; --gold:#f2a440;`.
- Add `.hero-band`, `#bh`, `.hero-band__fade`, `.hero-band__overlay`, `.hero-band__name`, `.hero-band__rule`, `.hero-band__aff`, and a `.hero-band__fallback` (CSS radial-gradient still for reduced-motion / no-WebGL).
- **Nav state change:** `.nav` defaults to transparent with cream links (it now sits over the dark band at the top); add a `.nav--over-hero`/solid toggle so it becomes the existing frosted-white style once `scrollY` passes the band. Switch `.nav` to `position: fixed` so the band can sit *under* the nav (name centered, clear of the 56px nav strip). Existing `scroll-padding-top` already offsets anchor jumps.
- Responsive: band `min-height` keeps it usable on short/landscape screens; name uses `clamp()`. BEM-like naming consistent with the existing file.

---

## 5. Fallbacks & edge cases

- **Reduced motion / no WebGL:** `.hero-band__fallback` (a static dark radial gradient with a faint warm center) shows; `blackhole.js` no-ops. Name + nav still render normally.
- **JS disabled:** band shows the static fallback gradient + the name overlay (plain HTML/CSS).
- **Slow GPU:** adaptive quality drops integration steps once.
- **Offscreen / hidden tab:** rAF paused to save battery.

---

## 6. Out of scope (YAGNI)

- Mouse parallax / camera interaction (original was fixed-camera; keep it).
- The "Avatar/medallion" placement (explored, not chosen).
- Any product-sector hover behavior (Accretion-specific; removed).
- A pre-rendered PNG fallback (CSS gradient is sufficient and dependency-free).
- Build tooling / npm / framework.

---

## 7. Verification (manual — static site, no test framework)

Serve with `python3 -m http.server` and confirm:
1. Intro reveal sweep plays once on load; disk filaments drift; animation is smooth.
2. Black hole looks **identical** to the accretion version (compare side-by-side with `accretion-web` running).
3. Nav: cream centered links over the band → frosted-white dark links after scrolling past it; active-link highlighting still works; mobile burger still opens the overlay menu.
4. Cosmic→paper seam is clean; no hard edge.
5. Name appears **once** (on the band); not in nav, not in About sidebar.
6. **No "Accretion" or product text anywhere** in the rendered page or source.
7. Narrow viewport / mobile UA: band renders at reduced quality, layout intact.
8. `prefers-reduced-motion` and a WebGL-disabled browser both show the static fallback gracefully.
9. Page still deploys as-is on GitHub Pages from `main` (no build artifacts required).
