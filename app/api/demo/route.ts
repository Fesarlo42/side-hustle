import { getServerSource } from '@/server/source'
import type { DemoCommand } from '@/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Demo controls (dev bar only): speed, pause, resume, restart. Never touches real data. */
export async function POST(req: Request) {
  const source = getServerSource()
  if (!source.command)
    return Response.json({ error: 'This source has no demo controls' }, { status: 404 })
  const body = (await req.json().catch(() => null)) as DemoCommand | null
  const valid =
    body &&
    ((body.action === 'speed' && [1, 10, 60].includes(body.value)) ||
      body.action === 'restart' ||
      body.action === 'pause' ||
      body.action === 'resume')
  if (!valid) return Response.json({ error: 'Unknown command' }, { status: 400 })
  source.command(body)
  return Response.json({ ok: true })
}
