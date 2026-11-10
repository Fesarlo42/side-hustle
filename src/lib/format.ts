/** Formatting for numbers, times and durations. Times show in the viewer's time zone. */

export function pct(n: number, digits = 0): string {
  const v = Math.round(n * 10 ** digits) / 10 ** digits
  return `${v.toFixed(digits)}%`
}

export function seatWeeks(n: number): string {
  return `${n.toFixed(1)}`
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function dayTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** "40 s", "5 min", "2 h 10 min", "3 d 4 h". */
export function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 === 0 ? `${h} h` : `${h} h ${m % 60} min`
  const d = Math.floor(h / 24)
  return h % 24 === 0 ? `${d} d` : `${d} d ${h % 24} h`
}

export function firstName(name: string | undefined): string {
  return name?.split(' ')[0] ?? '—'
}
