# OpenOPC Task — Substation Blueprint Viewer

## Goal

Build a Three.js **blueprint-style** 3D viewer of an electrical substation,
following the visual language of [redradman/artemis](https://github.com/redradman/artemis).
Single-page static site (vanilla JS + Three.js via CDN, no build step).
Publish to GitHub Pages at <https://ishadowland.github.io/substation-blueprint/>.

## Working directory

`/Users/liuyin/.hermes/repos/substation-blueprint` — public GitHub repo
(`ishadowland/substation-blueprint`). Push to `origin/main`. GitHub Pages
will serve from `main` branch root.

## Visual reference

The attached image (3d66-rendered aerial view of a substation). The viewer
must evoke the same composition in wireframe / blueprint mode:

- **Aerial high-angle** camera, looking diagonally down from front-left
- **Long rectangular industrial building** in upper-center, low-pitched
  paneled roof, off-white ribbed exterior walls
- **Perimeter wall** (waist-high, light-gray, irregular quadrilateral)
- **Curved access road** inside the compound, entering through a gate on
  the right-hand wall with metal bars + red/orange side panels
- **Three large transformer clusters** on concrete pads along the
  building's left/front side, each with dark gray vertical housings, white
  bus structures, and angled cylindrical bushings
- **Two parallel rows of switchgear bays** extending across the foreground
  with horizontal lattice busbars and A-frame/H-frame supports
- **Capacitor bank** in the upper-left, cream-colored ribbed enclosures with
  red/blue/dark terminals
- **Tall lightning mast** in the top-left-center, another tall leaning
  white pole near the left side
- **Steel lattice transmission towers** (3 visible) along the lower-left
  and left edge, with diagonal conductors stretching across the foreground
- **Landscaped grass + flower beds + deciduous trees** surrounding the
  compound, with a small lake at the top edge
- A few **vehicles** on the inner access road and exterior road

## Art direction (must follow Artemis style)

- **Pure black** background (`#000000`)
- **Warm cream** foreground (`#f0ebe0`, NOT pure white)
- **Single accent color: amber** (`#e8a23b`) for "selected" state
- **Wireframe-first**: every 3D object rendered primarily as
  `THREE.LineSegments` from `EdgesGeometry`. Use `MeshPhongMaterial`
  sparingly — the building can have a subtle solid mesh for shading, but
  all electrical equipment (transformers, busbars, towers) must be
  wireframe.
- **3 tone states** for any selectable component: `default` (white 0.85
  opacity) / `active` (amber 1.0 opacity, emissive boost) / `dimmed`
  (white 0.14 opacity).
- **Materials mutated in place** — when the user picks Blueprint vs
  Cinematic theme, call `material.color.setHex(...)` on the shared
  `LineBasicMaterial` instances. Don't allocate new materials per theme.
- **JetBrains Mono** font + wide letter-spacing (0.12em–0.35em) for HUD
  text — engineering-drawing feel.
- HUD chrome: minimal, top-bar with project title + theme picker + small
  caption. Bottom-bar with keyboard shortcuts.

## Three themes (must support)

| Theme | Palette | Lighting | Notes |
|---|---|---|---|
| | **Blueprint** (default) | paper-cyan `#dceafe` line, sky-cyan `#8fd2ff` active | flat, no lights, navy/black bg | cyanotype print |
| | **Space** | white `#ffffff` line, amber `#e8a23b` active | low ambient light | deep space, no celestial bodies needed |
| | **Cinematic** | white `#ffffff` line, amber `#e8a23b` active | 3-point key/fill, soft shadow plane | dramatic |

## Deliverables

In `/Users/liuyin/.hermes/repos/substation-blueprint/`:

| File | Purpose |
|---|---|
| `index.html` | Page shell, HUD, theme buttons, intro panel |
| `style.css` | CSS tokens (mirror Artemis palette), HUD layout, panels |
| `scene.js` | Three.js scene construction + render loop + interaction |
| `README.md` | One-paragraph project description, controls, credits |
| `.nojekyll` | Empty marker for GitHub Pages |
| `.gitignore` | Empty (single-file project, no node_modules) |

Three.js is loaded via `<script type="importmap">` pointing at a CDN (e.g.
`https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js` and
`addons/`). Use ES modules. No bundler.

## Acceptance criteria

1. Page loads at `https://ishadowland.github.io/substation-blueprint/` (after
   Pages setup) without console errors
2. Default theme is Blueprint, shows the substation in cyanotype wireframe
3. User can switch themes (Blueprint / Space / Cinematic) and materials
   update without flicker or material re-creation
4. Clicking a substation component (transformer, busbar, tower,
   capacitor bank, building) selects it: amber accent on selection, dim
   others
5. HUD shows: project title, current theme, selected component info
6. Substation composition matches the reference image:
   - Building in upper-center
   - Three transformer clusters along building front
   - Two rows of switchgear bays in foreground
   - Capacitor bank in upper-left
   - Two tall poles/masts
   - Three lattice towers along lower-left
   - Perimeter wall + gate on the right
   - Curved access road inside
   - Grass + flower beds + trees + small lake at top
7. Camera can be rotated by mouse drag (OrbitControls) and zoomed
8. Auto-rotate slowly while idle (like Artemis), pause on user interaction
9. No build step, no bundler, no React/Vue — pure vanilla

## Out of scope

- ❌ No real power-system simulation (this is a viewer, not a simulator)
- ❌ No multi-level navigation, no labels that the user can move freely
- ❌ No mobile touch controls
- ❌ No audio
- ❌ No level-of-detail switching

## Steps

1. Read this spec
2. Write `index.html` (HUD + theme buttons + canvas container)
3. Write `style.css` (mirror Artemis token system)
4. Write `scene.js` (the bulk of the work — scene construction, geometry,
   materials, interaction, themes)
5. Delegate to OpenCode via OPC to do the actual implementation
6. After OpenCode writes, verify the files exist
7. Commit + push to `origin/main`
8. Enable GitHub Pages via API:
   `gh api -X POST repos/ishadowland/substation-blueprint/pages -f source[branch]=main -f source[path]=/`
9. Verify the live URL responds with HTTP 200 and contains the page title

## Reference reading

Read before writing:
- `/Users/liuyin/.hermes/repos/iswiki/artemis-art-direction.md` — 12 art
  direction principles extracted from Artemis
- `/Users/liuyin/.hermes/repos/iswiki/artemis-redradman.md` — full Artemis
  breakdown
- The user's image (cached at
  `/Users/liuyin/.hermes/profiles/coder/cache/images/img_c8865be0671b.jpg`)

## Important

- **Do NOT ask for approval** for git, gh, curl, python3 -m http.server —
  already in the OPC allowlist.
- If you need additional commands (e.g. to inspect the image), describe
  what you're doing and proceed.
- Show me the file contents and the final live-URL response when done.
