declare module '*.png' {
  import type { StaticImageData } from 'next/image'
  const img: StaticImageData
  export default img
}
