'use client'
import { animate, motion as m, useMotionValue, useTransform } from 'framer-motion'
import { useEffect } from 'react'
import { useReducedMotionPref } from '@/hooks/useReducedMotionPref'
import { motion } from '@/motion'

/** Numbers update with a short count-up; instantly with reduced motion. */
export function CountUp({ value, digits = 0 }: { value: number; digits?: number }) {
  const reduced = useReducedMotionPref()
  const mv = useMotionValue(value)
  const text = useTransform(mv, (v) => v.toFixed(digits))
  useEffect(() => {
    if (reduced) {
      mv.set(value)
      return
    }
    const controls = animate(mv, value, { duration: motion.base.duration, ease: motion.base.ease })
    return () => controls.stop()
  }, [value, reduced, mv])
  return (
    <>
      {reduced ? (
        <span aria-hidden className="sh-num">
          {value.toFixed(digits)}
        </span>
      ) : (
        <m.span aria-hidden className="sh-num">
          {text}
        </m.span>
      )}
      <span className="sh-sr">{value.toFixed(digits)}</span>
    </>
  )
}
