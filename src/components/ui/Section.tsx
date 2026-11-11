'use client'
import Image, { type StaticImageData } from 'next/image'
import type { ReactNode } from 'react'

/** A group of panels opened by one of the brand banners ("Look who’s Token" …). */
export function Section({
  banner,
  alt,
  children,
}: {
  banner: StaticImageData | string
  alt: string
  children: ReactNode
}) {
  return (
    <section className="sh-section">
      <div className="sh-banner">
        <Image
          src={banner}
          alt={alt}
          width={1030}
          height={150}
          sizes="(max-width: 1100px) 90vw, 1030px"
          className="sh-banner__img"
        />
      </div>
      {children}
    </section>
  )
}
