import { Link, type LinkProps } from 'react-router-dom'
import type { ComponentProps } from 'react'

export function Button({ className = '', type = 'button', ...props }: ComponentProps<'button'>) {
  return <button type={type} className={`ui-button ${className}`} {...props} />
}

export function ButtonLink({ className = '', ...props }: LinkProps) {
  return <Link className={`ui-button inline-flex items-center justify-center text-center ${className}`} {...props} />
}
