'use client'
import { Badge, Icon } from '@iubenda/lumen-next'
import type { BadgeVariant, IconName } from '@iubenda/lumen'
import { AnimatePresence, motion as m } from 'framer-motion'
import { useMemo } from 'react'
import { Empty, Panel } from '@/components/ui/ui'
import { useReducedMotionPref } from '@/hooks/useReducedMotionPref'
import { clock } from '@/lib/format'
import { motion } from '@/motion'
import { visibleInsights } from '@/store/selectors'
import { focusRef, useData } from '@/store/store'
import { color } from '@/theme'
import type { InsightKind, InsightSeverity, InsightState } from '@/types'

const SEVERITY: Record<InsightSeverity, { text: string; variant: BadgeVariant; icon: IconName }> = {
  attention: { text: 'Needs attention', variant: 'destructive', icon: 'warning-diamond' },
  heads_up: { text: 'Heads-up', variant: 'warning', icon: 'warning' },
  info: { text: 'Info', variant: 'info', icon: 'info' },
}
const KIND: Record<InsightKind, string> = {
  service: 'Service',
  device: 'Device',
  flow: 'Flow',
  quality: 'Quality',
  pledge: 'Pledge',
  opportunity: 'Opportunity',
}
const STATE: Record<Exclude<InsightState, 'resolved'>, string> = {
  open: 'Open',
  handling: 'Being handled',
}

/** Informational only: insights never change configuration, so there are no action buttons. */
export function Insights() {
  const data = useData()
  const reduced = useReducedMotionPref()
  const items = useMemo(() => visibleInsights(data), [data])

  return (
    <Panel
      id="insights"
      title="Insights"
      aside={<span className="sh-muted">What the agents noticed</span>}
    >
      {items.length === 0 ? (
        <Empty>Nothing to flag. The agents will post here when they notice something.</Empty>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <AnimatePresence initial={false}>
            {items.map((i) => {
              const sev = SEVERITY[i.severity]
              const resolved = i.state === 'resolved'
              const first = i.related[0]
              return (
                <m.article
                  key={i.id}
                  id={`insight-${i.id}`}
                  layout={!reduced}
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: resolved ? 0.6 : 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={motion.base}
                  style={{
                    border: `1px solid ${color.border}`,
                    borderLeft: `6px solid ${resolved ? color.success : i.severity === 'attention' ? color.danger : i.severity === 'heads_up' ? color.warning : color.action}`,
                    borderRadius: 12,
                    padding: '10px 14px',
                    display: 'grid',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Badge variant={resolved ? 'success' : sev.variant}>
                      <Icon name={resolved ? 'check-circle' : sev.icon} size="sm" /> {sev.text}
                    </Badge>
                    <span className="sh-muted" style={{ fontSize: 14 }}>
                      {KIND[i.kind]}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 600 }}>
                      {resolved && i.resolvedAt
                        ? `Resolved at ${clock(i.resolvedAt)}`
                        : `${STATE[i.state as Exclude<InsightState, 'resolved'>]} · since ${clock(i.openedAt)}`}
                    </span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: 18 }}>
                    {first ? (
                      <button
                        className="sh-linkbtn"
                        style={{ fontWeight: 700 }}
                        onClick={() => focusRef(first)}
                      >
                        {i.title}
                      </button>
                    ) : (
                      i.title
                    )}
                  </h3>
                  <p style={{ margin: 0 }}>{i.detail}</p>
                  <p className="sh-muted" style={{ margin: 0 }}>
                    <strong>What the agents are doing:</strong> {i.agentAction}
                  </p>
                </m.article>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </Panel>
  )
}
