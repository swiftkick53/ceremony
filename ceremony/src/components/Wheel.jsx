import React from 'react'
import { BONE, INK } from '../tokens'

// The capture wheel: n topic segments (donut, outer R 128 / inner r 62 in a 320
// viewBox), outer hairline ring + 24 ticks. While recording the inner wheel
// rotates and the outer ring counter-rotates at half speed; the segment indexed
// by audio level lights up. When routed, the destination segment is lit plus a
// 4px dot on the rim at its mid-angle.
const CX = 160, CY = 160, R = 128, r = 62

const pol = (ang, rad) => [
  CX + rad * Math.cos((ang - 90) * Math.PI / 180),
  CY + rad * Math.sin((ang - 90) * Math.PI / 180),
]

const seg = (a0, a1) => {
  const [x0, y0] = pol(a0, R), [x1, y1] = pol(a1, R)
  const [x2, y2] = pol(a1, r), [x3, y3] = pol(a0, r)
  return `M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 0 0 ${x3} ${y3} Z`
}

export default function Wheel({ topics, phase, angle, active, filedToId }) {
  const rec = phase === 'rec', routed = phase === 'routed'
  const cols = topics.map(t => t.color)
  const step = 360 / cols.length
  const fi = Math.max(0, topics.findIndex(t => t.id === filedToId))

  const segs = cols.map((col, i) => {
    const a0 = i * step
    let op = 0.34
    if (rec) op = i === (active % cols.length) ? 1 : 0.22
    else if (routed) op = i === fi ? 1 : 0.12
    return (
      <path key={i} d={seg(a0, a0 + step)} fill={col} opacity={op}
        stroke={BONE} strokeWidth={2} style={{ transition: 'opacity .6s ease' }} />
    )
  })

  const ticks = []
  for (let i = 0; i < 24; i++) {
    const a = i * 15
    const [x0, y0] = pol(a, R + 9)
    const [x1, y1] = pol(a, R + (i % 2 ? 14 : 18))
    ticks.push(<line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={INK} strokeWidth={1} opacity={0.4} />)
  }

  let ptr = null
  if (routed) {
    const [px, py] = pol(fi * step + step / 2, R + 24)
    ptr = <circle cx={px} cy={py} r={4} fill={cols[fi]} />
  }

  return (
    <svg viewBox="0 0 320 320" width="100%" height="100%" style={{ display: 'block' }}>
      <g transform={rec ? `rotate(${-angle * 0.5} ${CX} ${CY})` : undefined}>
        <circle cx={CX} cy={CY} r={R + 9} fill="none" stroke={INK} strokeWidth={1} opacity={0.5} />
        {ticks}
      </g>
      <g transform={rec ? `rotate(${angle} ${CX} ${CY})` : undefined}>{segs}</g>
      {ptr}
    </svg>
  )
}
