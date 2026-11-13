import { expect, test } from 'vitest'
import { buildPlan } from './plan'

test('répartit les cartes avant le premier examen qui couvre le chapitre', () => {
  const plan = buildPlan({ today: '2026-11-09', exams: [
    { id: 'a', title: 'Brevet', date: '2026-11-11', subjects: ['Maths'], chapterIds: [] },
    { id: 'b', title: 'Devoir', date: '2026-11-13', subjects: ['Maths'], chapterIds: [] },
  ], chapters: [{ id: 'c', title: 'Fractions', subject: 'Maths', unseenCards: 8, dueByDate: {} }], dailyMinutes: 15, restDays: [] })
  expect(plan.days.slice(0, 2).map(day => day.items[0]?.newCards)).toEqual([4, 4])
  expect(plan.days.flatMap(day => day.items).every(item => item.examId === 'a')).toBe(true)
})

test('la capacité et l’ordre des matières sont appliqués aux jours sans repos', () => {
  const plan = buildPlan({ today: '2026-11-09', exams: [{ id: 'a', title: 'Brevet', date: '2026-11-11', subjects: ['Maths', 'Français'], chapterIds: [] }],
    chapters: [{ id: 'm', title: 'Calcul', subject: 'Maths', unseenCards: 2, dueByDate: {} }, { id: 'f', title: 'Lecture', subject: 'Français', unseenCards: 2, dueByDate: {} }],
    dailyMinutes: 15, restDays: [], capacity: () => 1, subjectOrder: () => ['Français'] })
  expect(plan.days[0].capacityCards).toBe(1)
  expect(plan.days[0].items.map(item => item.subject)).toEqual(['Français', 'Maths'])
  expect(plan.exams[0].overloaded).toBe(true)
})

test('les cartes dues en retard et un jour de repos sont reportées au prochain jour actif', () => {
  const plan = buildPlan({ today: '2026-11-09', exams: [{ id: 'a', title: 'Brevet', date: '2026-11-12', subjects: ['Maths'], chapterIds: [] }],
    chapters: [{ id: 'm', title: 'Calcul', subject: 'Maths', unseenCards: 0, dueByDate: { '2026-11-08': 2, '2026-11-10': 1 } }],
    dailyMinutes: 15, restDays: [2] })
  expect(plan.days[0].items[0].dueCards).toBe(2)
  expect(plan.days[1].items).toEqual([])
  expect(plan.days[2].items[0].dueCards).toBe(1)
})
