import type { ComponentProps } from 'react'

export function Progress({ className = '', ...props }: ComponentProps<'progress'>) {
  return <progress className={`ui-progress [&::-webkit-progress-bar]:!bg-border [&::-webkit-progress-value]:!bg-primary [&::-moz-progress-bar]:!bg-primary ${className}`} {...props} />
}
