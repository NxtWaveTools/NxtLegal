import { Loader2 } from 'lucide-react'

type SpinnerProps = {
  size?: number
  className?: string
}

export default function Spinner({ size = 14, className }: SpinnerProps) {
  return <Loader2 className={`animate-spin ${className ?? ''}`} size={size} aria-hidden="true" />
}
