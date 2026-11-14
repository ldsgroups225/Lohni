import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, isExpress, localDay, mondayOf, weekday, dueOnLocalDay } from './day'

describe('student day', () => {
  it('formats the local calendar date, not the UTC one', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(localDay(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3)
    expect(daysBetween('2026-11-15', '2026-11-14')).toBe(-1)
  })
  it('finds Monday, Sunday included', () => {
    expect(mondayOf('2026-11-09')).toBe('2026-11-09')
    expect(mondayOf('2026-11-15')).toBe('2026-11-09')
    expect(mondayOf('2026-11-16')).toBe('2026-11-16')
    expect(mondayOf('2027-01-01')).toBe('2026-12-28')
  })
  it('numbers weekdays from Sunday', () => {
    expect(weekday('2026-11-15')).toBe(0)
    expect(weekday('2026-11-16')).toBe(1)
    expect(weekday('2026-11-14')).toBe(6)
  })
  it('is express only the day before the exam', () => {
    expect(isExpress('2026-11-15', '2026-11-14')).toBe(true)
    expect(isExpress('2027-01-01', '2026-12-31')).toBe(true)
    expect(isExpress('2026-11-14', '2026-11-14')).toBe(false)
    expect(isExpress('2026-11-16', '2026-11-14')).toBe(false)
    expect(isExpress('2026-11-13', '2026-11-14')).toBe(false)
  })
})

describe('dueOnLocalDay', () => {
  it('place l’échéance sur le jour local de l’élève en avance sur UTC (01 h 30 à UTC+3)', () => {
    const due = dueOnLocalDay(new Date('2026-11-12T22:30:00Z'), new Date('2026-11-09T22:30:00Z'), '2026-11-10')
    expect(due.slice(0, 10)).toBe('2026-11-13')
  })
  it('place l’échéance sur le jour local de l’élève en retard sur UTC (21 h à UTC−5)', () => {
    const due = dueOnLocalDay(new Date('2026-11-13T02:00:00Z'), new Date('2026-11-10T02:00:00Z'), '2026-11-09')
    expect(due.slice(0, 10)).toBe('2026-11-12')
  })
  it('ne change rien quand le jour local est le jour UTC (Abidjan)', () => {
    expect(dueOnLocalDay(new Date('2026-11-12T10:00:00Z'), new Date('2026-11-09T10:00:00Z'), '2026-11-09')).toBe('2026-11-12T10:00:00.000Z')
  })
})
