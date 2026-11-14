import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isExpress, localDay } from '../../../../backend/src/services/revision/day'

export function ExamButton({ id, date }: { id: string; date: string }) {
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const express = isExpress(date, localDay())
  return <div><button type="button" className="ui-button-secondary" onClick={() => {
    if (!navigator.onLine) setError('Connecte-toi pour lancer une révision d’examen.')
    else navigate(`/revision?exam=${encodeURIComponent(id)}`)
  }}>{express ? 'Révision express' : 'Réviser cet examen'}</button>{error && <p role="status">{error}</p>}</div>
}
