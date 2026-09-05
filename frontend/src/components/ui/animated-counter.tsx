import React, { useEffect, useState, useRef } from 'react'

export interface AnimatedCounterProps {
  value: number
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
  className?: string
}

export function formatCounterValue(
  val: number,
  decimals: number = 0,
  prefix: string = '',
  suffix: string = ''
): string {
  const safeVal = Number.isFinite(val) ? val : 0
  const formattedNumber = safeVal.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `${prefix}${formattedNumber}${suffix}`
}

export function calculateAnimatedValue(
  startVal: number,
  targetVal: number,
  progress: number
): number {
  if (progress >= 1) return targetVal
  if (progress <= 0) return startVal
  // easeOutCubic: 1 - (1 - t)^3
  const eased = 1 - Math.pow(1 - progress, 3)
  return startVal + (targetVal - startVal) * eased
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  duration = 1000,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
}) => {
  const [displayValue, setDisplayValue] = useState<number>(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    ) {
      return value
    }
    return 0
  })

  const prevValueRef = useRef<number>(0)
  const animFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

    if (prefersReducedMotion || duration <= 0) {
      setDisplayValue(value)
      prevValueRef.current = value
      return
    }

    const startVal = prevValueRef.current
    const targetVal = value
    const startTime = performance.now()

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(1, elapsed / duration)
      const currentEased = calculateAnimatedValue(startVal, targetVal, progress)

      if (progress < 1) {
        setDisplayValue(currentEased)
        animFrameRef.current = requestAnimationFrame(step)
      } else {
        // Guaranteed exact landing on the target value with zero rounding drift
        setDisplayValue(targetVal)
        prevValueRef.current = targetVal
      }
    }

    animFrameRef.current = requestAnimationFrame(step)

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [value, duration])

  return (
    <span className={className}>
      {formatCounterValue(displayValue, decimals, prefix, suffix)}
    </span>
  )
}

export default AnimatedCounter
