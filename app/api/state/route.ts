import { getServerSource } from '@/server/source'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Snapshot: everything the dashboard needs to start. */
export function GET() {
  return Response.json(getServerSource().snapshot(), { headers: { 'Cache-Control': 'no-store' } })
}
