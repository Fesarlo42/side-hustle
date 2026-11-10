'use client'
import { useState } from 'react'
import { Dashboard } from '@/components/Dashboard'
import { HttpSource } from '@/data/source'

export default function Page() {
  const [source] = useState(() => new HttpSource())
  return <Dashboard source={source} />
}
