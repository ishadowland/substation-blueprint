# Substation Blueprint Viewer

A wireframe-style **Three.js** viewer of an electrical substation, rendered in
the art direction of [redradman/artemis](https://github.com/redradman/artemis).
Three themes ship in one page — **Blueprint** (cyanotype), **Space**, and
**Cinematic** — and share a single set of geometries: theme switching only
mutates the shared `LineBasicMaterial` colors in place. Click any component
(building, transformer, switchgear, capacitor bank, mast, lattice tower,
perimeter wall, gate, road, or landscape) to isolate it and read its metadata
in the info panel; click empty space to clear. The camera auto-rotates slowly
while you are idle and resumes on interaction.

The page is pure static HTML + ES-module JavaScript. Three.js `0.160.0` is
loaded via an `importmap` from `cdn.jsdelivr.net`, so there is no build step,
no bundler, no framework. Drop the folder on any static host — currently
served from GitHub Pages at
<https://ishadowland.github.io/substation-blueprint/>.

## Controls

| Action              | Input                            |
| ------------------- | -------------------------------- |
| Orbit camera        | `drag` with mouse                |
| Zoom                | `scroll wheel`                   |
| Select component    | `click` on a wireframe element   |
| Clear selection     | `Esc` or click empty space       |
| Switch theme        | top-right buttons **or** `1` `2` `3` |
| Collapse info panel | `×` in the panel header          |

## Credits

- Art direction + design tokens inspired by
  [redradman/artemis](https://github.com/redradman/artemis) — engineering
  blueprint × warm-cream wireframe × single amber accent.
- Built with [Three.js](https://threejs.org/) `0.160.0` via the jsDelivr CDN.
- JetBrains Mono for the engineering-drawing HUD typography.