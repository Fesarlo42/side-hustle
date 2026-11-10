import { getServerSource } from '@/server/source'
import type { StreamMessage } from '@/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Server-Sent Events: one message per event, plus a pulse every 2 s. */
export function GET(req: Request) {
  const source = getServerSource()
  const encoder = new TextEncoder()
  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (msg: StreamMessage) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`))
      controller.enqueue(encoder.encode('retry: 2000\n\n'))
      const unsubscribe = source.subscribe(send)
      const keepAlive = setInterval(
        () => controller.enqueue(encoder.encode(': keep-alive\n\n')),
        15_000,
      )
      cleanup = () => {
        unsubscribe()
        clearInterval(keepAlive)
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
      req.signal.addEventListener('abort', () => cleanup())
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
