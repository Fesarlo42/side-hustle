import type { Metadata } from 'next'
import { color, font } from '@/theme'
import './globals.css'

export const metadata: Metadata = {
  title: 'Side hustle',
  description: 'Who pledged what, what the agents are doing, and where the pledges go.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Lumen switches to dark mode with the OS. The dashboard is light only (projector).
    <html lang="en" data-theme="light">
      <body style={{ background: color.surfaceSubtle, color: color.text, fontFamily: font.body }}>
        {children}
      </body>
    </html>
  )
}
