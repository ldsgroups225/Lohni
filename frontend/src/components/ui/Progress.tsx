import type { ComponentProps } from 'react'

export function Progress({ className = '', ...props }: ComponentProps<'progress'>) {
  return <progress className={`ui-progress ${className}`} {...props} />
}
