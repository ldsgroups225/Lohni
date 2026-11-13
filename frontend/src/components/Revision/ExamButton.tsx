import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function ExamButton({ id, date }: { id: string; date: string }) {
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const today = new Date()
  const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const express = Date.parse(date) - Date.parse(local) === 86400000
  return <div><button type="button" className="text-primary underline" onClick={() => {
    if (!navigator.onLine) setError('Connecte-toi pour lancer une révision d’examen.')
    else navigate(`/revision?exam=${encodeURIComponent(id)}`)
  }}>{express ? 'Révision express' : 'Réviser cet examen'}</button>{error && <p role="status">{error}</p>}</div>
}
