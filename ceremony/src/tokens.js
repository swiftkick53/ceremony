// Design tokens — after Peter Saville. Values are final design intent (see handoff README).
export const BONE = 'oklch(0.95 0.012 85)'
export const INPUT_BG = 'oklch(0.97 0.008 85)'
export const INSET_BG = 'oklch(0.92 0.012 85)'
export const INK = 'oklch(0.2 0.01 70)'
export const VIOLET = 'oklch(0.55 0.15 300)'
export const VIOLET_TEXT = 'oklch(0.97 0.02 300)'
export const RED = 'oklch(0.6 0.16 25)'
export const RED_TEXT = 'oklch(0.97 0.02 25)'

// the six colours of the code
export const PALETTE = [
  'oklch(0.55 0.15 300)', // work violet
  'oklch(0.63 0.12 150)', // studio green
  'oklch(0.62 0.10 225)', // ideas cyan
  'oklch(0.71 0.13 55)',  // people orange
  'oklch(0.60 0.16 25)',  // journal red
  'oklch(0.70 0.02 260)', // inbox grey
]

export const hair = (a) => `oklch(0.2 0.01 70 / ${a})`
export const grey = (l) => `oklch(${l} 0.01 70)`

export const JOST = "'Jost', sans-serif"
export const BODONI = "'Bodoni Moda', serif"
export const MONO = "'Space Mono', monospace"
