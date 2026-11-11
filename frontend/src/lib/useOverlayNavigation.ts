import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export function useOverlayNavigation(id: string, onClose?: () => void): [boolean, (open: boolean) => void] {
  const location = useLocation()
  const navigate = useNavigate()
  const opened = useRef(false)
  const open = opened.current && (location.state?.overlays ?? [location.state?.overlay]).includes(id)
  const current = useRef({ open, location })
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const wasOpen = useRef(false)
  current.current = { open, location }
  useEffect(() => {
    if (location.state?.overlay === id && !opened.current) {
      if (location.key !== 'default' && (window.history.state?.idx ?? 1) > 0) navigate(-1)
      else {
        const { overlay: _overlay, overlays: _overlays, ...state } = location.state
        navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state })
      }
    }
    if (wasOpen.current && !open) {
      opened.current = false
      onCloseRef.current?.()
    }
    wasOpen.current = open
  }, [id, location, navigate, open])
  return [open, next => {
    if (next === current.current.open) return
    current.current.open = next
    const { location } = current.current
    if (next) {
      opened.current = true
      const overlays = location.state?.overlays ?? (location.state?.overlay ? [location.state.overlay] : [])
      navigate(`${location.pathname}${location.search}${location.hash}`, { state: { ...location.state, overlay: id, overlays: [...overlays, id] } })
    } else navigate(-1)
  }]
}
