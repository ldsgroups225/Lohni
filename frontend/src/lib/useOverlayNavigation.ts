import { useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export function useOverlayNavigation(id: string): [boolean, (open: boolean) => void] {
  const location = useLocation()
  const navigate = useNavigate()
  const open = location.state?.overlay === id
  const current = useRef({ open, location })
  current.current = { open, location }
  return [open, next => {
    if (next === current.current.open) return
    current.current.open = next
    const { location } = current.current
    if (next) navigate(`${location.pathname}${location.search}${location.hash}`, { state: { ...location.state, overlay: id } })
    else navigate(-1)
  }]
}
