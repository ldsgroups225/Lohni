import { Link, type LinkProps } from 'react-router-dom'
import type { ComponentProps } from 'react'

// primary : action principale ; secondary : bouton bordé ; ghost : bouton texte discret, sans soulignement.
type Variant = 'primary' | 'secondary' | 'ghost'
const variants: Record<Variant, string> = { primary: 'ui-button', secondary: 'ui-button-secondary', ghost: 'ui-button-ghost' }

export function Button({ className = '', type = 'button', variant = 'primary', ...props }: ComponentProps<'button'> & { variant?: Variant }) {
  return <button type={type} className={`${variants[variant]} ${className}`} {...props} />
}

export function ButtonLink({ className = '', variant = 'primary', ...props }: LinkProps & { variant?: Variant }) {
  return <Link className={`${variants[variant]} inline-flex items-center justify-center text-center ${className}`} {...props} />
}
