import type { EngineInterface, Register, Timer } from 'claude-code'

import { driftScene, frame, type Mode } from './field'
import { makeColors } from './make-colors.js'

// ---------- colors ----------
// Faintly blue grays at night, graphite on cream by day.
const COLORS = makeColors({
  label: 'Tipos',
  roles: { accent: '#78A0F5', pro: '#F5A587', danger: '#E5484D', success: '#5FB98A', warning: '#E2A33B' },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#09090C',
        'surface-1': '#0B0B0F',
        'surface-2': '#0D0D11',
        'surface-3': '#15151B',
        'text-primary': '#F4F2EE',
        'text-secondary': '#CAC8D0',
        'text-muted': '#9C9AA5',
      },
    },
  },
  light: {
    roles: { accent: '#3F5F9F', pro: '#A0573C' },
    gray: {
      anchors: {
        'surface-0': '#EFE9DD',
        'surface-1': '#F4EFE5',
        'surface-2': '#F9F6EF',
        'text-primary': '#25262A',
        'text-secondary': '#45464C',
        'text-muted': '#5C5D63',
      },
    },
  },
})

// ---------- timing ----------
// On desktop the field drifts by itself (CSS inside the SVG). Only mobile gets new frames
// from the mod, and slowly; the wave runs faster while Claude is working.
const CALM = 1 // wave seconds per second at rest
const BUSY = 3.2 // while Claude works
const IDLE_PAUSE_MS = 3 * 60_000
const STEP_CALM_MS = 45_000
const STEP_BUSY_MS = 10_000

const MODE_KEY = 'mode'
const MODES: Record<string, Mode> = { auto: 'auto', light: 'light', dark: 'dark', claro: 'light', escuro: 'dark' }

let sBase = 37 // starts on a stretch with glyphs on both sides
let tBase = Date.now()
let speed = CALM
let working = false
let paused = false
let mode: Mode = 'auto'
let applied = false
let idleTimer: Timer | undefined
let stepTimer: Timer | undefined
let stepMs = 0
let drift: string | undefined // the drifting scene, built once per mode
const mobiles = new Set<string>()

const waveNow = () => sBase + ((Date.now() - tBase) / 1000) * speed

// Changes speed and frame rhythm without a jump in the wave.
function retune($: EngineInterface) {
  const nextSpeed = paused ? 0 : working ? BUSY : CALM
  if (nextSpeed !== speed) {
    sBase = waveNow()
    tBase = Date.now()
    speed = nextSpeed
  }
  const nextStep = paused || mobiles.size === 0 ? 0 : working ? STEP_BUSY_MS : STEP_CALM_MS
  if (nextStep !== stepMs) {
    stepTimer?.cancel()
    stepTimer = nextStep > 0 ? $.clock.every(nextStep, () => $.ui.invalidate('ui.render')) : undefined
    stepMs = nextStep
    $.ui.invalidate('ui.render')
  }
}

// Marks activity: unpauses and re-arms the idle pause.
function activity($: EngineInterface) {
  idleTimer?.cancel()
  paused = false
  retune($)
  idleTimer = $.clock.after(IDLE_PAUSE_MS, () => {
    if (working) return
    paused = true
    retune($)
  })
}

// Applies colors and backdrop. Runs on session.start, or on the first turn if the mod
// loaded mid-session.
async function apply($: EngineInterface) {
  applied = true
  const set = await $.theme.set({ colors: COLORS.theme, backdrop: { scene: 'tipos', glass: { blur: 0, opacity: 0.3 } } })
  $.ui.status(undefined)
  if (!set.isDrawn) applied = false
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get(MODE_KEY)
    if (typeof saved === 'string' && MODES[saved] !== undefined) mode = MODES[saved]
    const unpainted = COLORS.problems.find(line => line.startsWith("Desktop won't paint"))
    if (unpainted !== undefined) $.ui.toast(unpainted)
    await $.command.register({
      name: 'tipos',
      description: 'Tipos backdrop colors: dark, light or auto',
      argumentHint: '[auto|light|dark]',
    })
    await apply($)
    activity($)
    return next(e)
  })

  on('command.run', { command: 'tipos' }, async ($, e) => {
    const picked = MODES[e.args.trim().toLowerCase()]
    if (picked === undefined) return { text: `Tipos is ${mode}. Use /tipos auto|light|dark.` }
    mode = picked
    drift = undefined
    await $.store.set(MODE_KEY, picked)
    activity($)
    $.ui.invalidate('ui.render')
    return { text: `Tipos: ${picked}.` }
  })

  // Working: from the start to the end of each main-conversation turn.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      working = true
      if (!applied) await apply($)
      activity($)
    }
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      working = false
      activity($)
    }
    return next(e)
  })
  on('session.attach', async ($, e, next) => {
    if (!applied && (e.surface === 'desktop' || e.surface === 'mobile')) await apply($)
    if (e.surface === 'mobile') mobiles.add(e.clientId)
    activity($)
    return next(e)
  })
  on('session.detach', async ($, e, next) => {
    mobiles.delete(e.clientId)
    retune($)
    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || e.props.scene !== 'tipos') return next(e)
    const { Svg } = $.ui.resolve(e)
    const alt = 'A field of characters drifting slowly from left to right'
    if (e.surface === 'mobile') return <Svg source={frame(waveNow(), mode)} alt={alt} />
    // Always the same text: a different SVG would make the app reload the scene (and flash).
    drift ??= driftScene(mode)
    return <Svg source={drift} isInteractive alt={alt} />
  })
}
