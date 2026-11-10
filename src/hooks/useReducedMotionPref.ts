'use client'
import { useReducedMotion } from 'framer-motion'
import { useDash } from '@/store/store'

/** OS setting, unless the page toggle overrides it. */
export function useReducedMotionPref(): boolean {
  const os = useReducedMotion() ?? false
  const override = useDash((s) => s.reducedMotionOverride)
  return override ?? os
}
