// The Tipos field as SVG: a grid of the glyphs .·:-=+*%# whose weight comes from fbm noise
// plus a sine wave, cool blue to warm peach on near-black (or graphite on cream).
import { GLYPH_PATHS } from './glyph-shapes'

export type Mode = 'auto' | 'light' | 'dark'

// The grid covers the window in points (1470×923); `slice` crops the edges at other ratios.
const VIEW_W = 1470
const VIEW_H = 923
const CELL_W = 22
const CELL_H = 28
// Each glyph (1 to 9) comes in three shades so color and opacity follow the value.
const SHADES = 3

// The conversation column, in window points, and the soft edge of its mask.
const COLUMN = { left: 318, right: 1112, feather: 120, floor: 0.5 }

type RGB = [number, number, number]
const COOL: RGB = [120, 160, 245] // #78A0F5
const WARM: RGB = [245, 165, 135] // #F5A587
const DARK_BG = '#09090C'
const INK_COOL: RGB = [52, 60, 76]
const INK_WARM: RGB = [92, 70, 58]
const LIGHT_BG = '#EFE9DD'

// ---------- noise ----------
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
}
const PERM: Int32Array = (() => {
  const r = rng(101)
  const p = new Int32Array(512)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const t = p[i]!
    p[i] = p[j]!
    p[j] = t
  }
  p.copyWithin(256, 0, 256)
  return p
})()
const nf = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
function gr(hs: number, x: number, y: number) {
  switch (hs & 7) {
    case 0: return x + y
    case 1: return -x + y
    case 2: return x - y
    case 3: return -x - y
    case 4: return x
    case 5: return -x
    case 6: return y
    default: return -y
  }
}
// Perlin noise; with `px`/`py` the lattice wraps, which makes a seamless tile.
function noise(x: number, y: number, px = 256, py = 256) {
  const fx = Math.floor(x)
  const fy = Math.floor(y)
  const x0 = ((fx % px) + px) % px
  const y0 = ((fy % py) + py) % py
  const x1 = (x0 + 1) % px
  const y1 = (y0 + 1) % py
  x -= fx
  y -= fy
  const u = nf(x)
  const v = nf(y)
  const h = (X: number, Y: number) => PERM[PERM[X]! + Y]!
  const l1 = gr(h(x0, y0), x, y) + (gr(h(x1, y0), x - 1, y) - gr(h(x0, y0), x, y)) * u
  const l2 = gr(h(x0, y1), x, y - 1) + (gr(h(x1, y1), x - 1, y - 1) - gr(h(x0, y1), x, y - 1)) * u
  return l1 + (l2 - l1) * v
}
const fbm = (x: number, y: number) => noise(x, y) * 0.65 + noise(x * 2.1 + 5.2, y * 2.1 + 1.3) * 0.35
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x)
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const hex = (c: RGB) => '#' + c.map(n => Math.round(n).toString(16).padStart(2, '0')).join('')

// ---------- shared SVG parts ----------
const palette = (light: boolean) =>
  light
    ? { cool: INK_COOL, warm: INK_WARM, bg: LIGHT_BG, alpha: (v: number) => 0.14 + 0.5 * v }
    : { cool: COOL, warm: WARM, bg: DARK_BG, alpha: (v: number) => 0.2 + 0.6 * v }

// The CSS rule for one shade; `--m` lets a cell dim itself behind the column.
function shadeRule(light: boolean, gi: number, k: number, masked: boolean) {
  const { cool, warm, alpha } = palette(light)
  const v = (gi + (k + 0.5) / SHADES) / 10
  const a = alpha(v).toFixed(3)
  return `.c${gi}${k}{fill:${hex(mix(cool, warm, clamp((v - 0.3) * 1.6, 0, 1)))};fill-opacity:${masked ? `calc(var(--m,1)*${a})` : a}}`
}
function shadeRules(light: boolean) {
  let css = `.bg{fill:${palette(light).bg}}`
  for (let gi = 1; gi <= 9; gi++) for (let k = 0; k < SHADES; k++) css += shadeRule(light, gi, k, true)
  return css
}
const paletteCss = (mode: Mode) =>
  mode === 'dark' ? shadeRules(false)
  : mode === 'light' ? shadeRules(true)
  : `${shadeRules(false)}@media (prefers-color-scheme:light){${shadeRules(true)}}`

// Each glyph is a Geist outline in <use>: the app draws shapes faster than embedded-font text.
const SHAPE_DEFS = GLYPH_PATHS.map((d, gi) => (gi === 0 ? '' : `<path id="s${gi}" d="${d}"/>`)).join('')

// Dims the glyphs behind the conversation column (`url(#m)`).
const maskStop = (x: number, o: number) => `<stop offset="${(x / VIEW_W).toFixed(4)}" stop-color="#fff" stop-opacity="${o}"/>`
const COLUMN_MASK =
  `<linearGradient id="col" x1="0" x2="${VIEW_W}" gradientUnits="userSpaceOnUse">` +
  maskStop(COLUMN.left - COLUMN.feather, 1) + maskStop(COLUMN.left, COLUMN.floor) +
  maskStop(COLUMN.right, COLUMN.floor) + maskStop(COLUMN.right + COLUMN.feather, 1) +
  `</linearGradient><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW_W}" height="${VIEW_H}">` +
  `<rect width="${VIEW_W}" height="${VIEW_H}" fill="#000"/><rect width="${VIEW_W}" height="${VIEW_H}" fill="url(#col)"/></mask>`

// Film grain as tiny vector dots (the app strips <image>).
const GRAIN = (() => {
  const r = rng(7)
  let dots = ''
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(r() * 96)
    const y = Math.floor(r() * 96)
    dots += `<rect x="${x}" y="${y}" width="1" height="1" fill="${r() < 0.5 ? '#fff' : '#000'}" fill-opacity="${(0.03 + r() * 0.05).toFixed(3)}"/>`
  }
  return `<pattern id="vg" width="96" height="96" patternUnits="userSpaceOnUse">${dots}</pattern>`
})()

// Value in 0..1 → glyph index (0 = empty) and shade.
function toneOf(v: number): [number, number] {
  const gi = Math.floor(clamp(v, 0, 1) * 9.99)
  return [gi, Math.min(SHADES - 1, Math.floor((v * 10 - gi) * SHADES))]
}

// ---------- a still frame (mobile) ----------
// The column mask at x, in steps of 0.1, baked into each glyph's opacity.
function maskAt(x: number): number {
  const { left, right, feather, floor } = COLUMN
  let m = 1
  if (x > left - feather && x < right + feather) {
    if (x < left) m = 1 - ((x - (left - feather)) / feather) * (1 - floor)
    else if (x > right) m = floor + ((x - right) / feather) * (1 - floor)
    else m = floor
  }
  return Math.round(m * 10) / 10
}

// One frame of the field at wave time `s` (seconds).
export function frame(s: number, mode: Mode): string {
  const groups = new Map<string, string>()
  for (let y = 14; y < VIEW_H; y += CELL_H) {
    for (let cx = 11; cx < VIEW_W; cx += CELL_W) {
      const v = 0.5 + 0.8 * fbm(cx * 0.0024 + s * 0.03, y * 0.0042 - s * 0.012) + 0.22 * Math.sin(cx * 0.004 - y * 0.006 + s * 0.4)
      const [gi, k] = toneOf(v)
      if (gi === 0) continue
      const key = `${gi}${k}:${maskAt(cx)}`
      groups.set(key, (groups.get(key) ?? '') + `<use href="#s${gi}" x="${cx}" y="${y}"/>`)
    }
  }
  const body = [...groups].map(([key, uses]) => {
    const [cls, m] = key.split(':')
    return `<g class="c${cls}"${m === '1' ? '' : ` style="--m:${m}"`}>${uses}</g>`
  }).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid slice">` +
    `<style>${paletteCss(mode)}</style><defs>${SHAPE_DEFS}${GRAIN}</defs>` +
    `<rect class="bg" width="${VIEW_W}" height="${VIEW_H}"/>${body}` +
    `<rect width="${VIEW_W}" height="${VIEW_H}" fill="url(#vg)"/></svg>`
  )
}

// ---------- the drifting field (desktop) ----------
// The app animates a backdrop's CSS, but silently freezes it if the SVG has @media (other than
// prefers-reduced-motion), an embedded font or an <image>. So the motion is a seamless tile
// sliding by transform, and `auto` falls back to dark.
const TILE_W = 1254 // 57 cells of 22 px
const TILE_H = 952 // 34 cells of 28 px
const LATTICE_X = 3 // noise lattice turns per tile: 3/1254 ≈ 0.0024
const LATTICE_Y = 4 // 4/952 ≈ 0.0042
const DRIFT_PX_PER_S = 0.03 / 0.0024

const tileFbm = (x: number, y: number) =>
  noise(x, y, LATTICE_X, LATTICE_Y) * 0.65 + noise(x * 2 + 5, y * 2 + 1, LATTICE_X * 2, LATTICE_Y * 2) * 0.35

// One lap of the tile every `TILE_W / DRIFT_PX_PER_S` seconds, in `fps` steps per second
// (stepping costs far less CPU than letting the browser repaint at 60 fps).
export function driftScene(mode: Mode, fps = 12): string {
  const light = mode === 'light'
  const css: string[] = []
  const groups = new Map<string, string[]>()
  for (let j = 0; j < TILE_H / CELL_H; j++) {
    for (let i = 0; i < TILE_W / CELL_W; i++) {
      const cx = 11 + i * CELL_W
      const cy = 14 + j * CELL_H
      // Sine wave frequencies chosen to close on the tile.
      const v =
        0.5 + 0.8 * tileFbm((cx / TILE_W) * LATTICE_X, (cy / TILE_H) * LATTICE_Y) +
        0.22 * Math.sin((2 * Math.PI * cx) / TILE_W - (2 * Math.PI * cy) / TILE_H)
      const [gi, k] = toneOf(v)
      if (gi === 0) continue
      const cls = `c${gi}${k}`
      if (!groups.has(cls)) {
        css.push(shadeRule(light, gi, k, false))
        groups.set(cls, [])
      }
      groups.get(cls)!.push(`<use href="#s${gi}" x="${cx}" y="${cy}"/>`)
    }
  }
  const tile = [...groups].map(([cls, uses]) => `<g class="${cls}">${uses.join('')}</g>`).join('')
  const seconds = Math.round(TILE_W / DRIFT_PX_PER_S)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><style>` +
    css.join('') +
    `@keyframes drift{to{transform:translate(${-TILE_W}px,0)}}.drift{animation:drift ${seconds}s steps(${seconds * fps}) infinite}` +
    `@media (prefers-reduced-motion: reduce){.drift{animation:none}}` +
    `</style><rect width="100%" height="100%" fill="${palette(light).bg}"/>` +
    `<svg width="100%" height="100%" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid slice"><defs>` +
    SHAPE_DEFS + `<g id="tile">${tile}</g>` + COLUMN_MASK + GRAIN +
    `</defs><g mask="url(#m)"><g class="drift">` +
    `<use href="#tile"/><use href="#tile" x="${TILE_W}"/><use href="#tile" x="${TILE_W * 2}"/>` +
    `</g></g><rect width="${VIEW_W}" height="${VIEW_H}" fill="url(#vg)"/></svg></svg>`
  )
}
