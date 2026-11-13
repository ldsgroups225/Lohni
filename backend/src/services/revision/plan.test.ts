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
    dailyMinutes: 15, restDays: [], capacity: () => 2, subjectOrder: () => ['Français'] })
  expect(plan.days[0].capacityCards).toBe(2)
  expect(plan.days[0].items.map(item => item.subject)).toEqual(['Français', 'Maths'])
  expect(plan.exams[0].overloaded).toBe(false)
})

test('les cartes dues en retard et un jour de repos sont reportées au prochain jour actif', () => {
  const plan = buildPlan({ today: '2026-11-09', exams: [{ id: 'a', title: 'Brevet', date: '2026-11-12', subjects: ['Maths'], chapterIds: [] }],
    chapters: [{ id: 'm', title: 'Calcul', subject: 'Maths', unseenCards: 0, dueByDate: { '2026-11-08': 2, '2026-11-10': 1 } }],
    dailyMinutes: 15, restDays: [2] })
  expect(plan.days[0].items[0].dueCards).toBe(2)
  expect(plan.days[1].items).toEqual([])
  expect(plan.days[2].items[0].dueCards).toBe(1)
})


test('les minutes affichées sont entières pour chaque chapitre et chaque jour', () => {
  const plan = buildPlan({ today: '2026-11-09', exams: [{ id: 'a', title: 'Brevet', date: '2026-11-10', subjects: ['Maths'], chapterIds: [] }], chapters: [{ id: 'c', subject: 'Maths', title: 'Calcul', unseenCards: 1, dueByDate: {} }], dailyMinutes: 15, restDays: [] })
  expect(plan.days[0].minutes).toBe(1)
  expect(plan.days[0].items[0].minutes).toBe(1)
})


test.each([[15, 10], [30, 20], [45, 30]])('plafonne les nouvelles cartes pour %s minutes', (dailyMinutes, maximum) => {
  const plan = buildPlan({ today: '2026-11-09', exams: [{ id: 'a', title: 'Brevet', date: '2026-11-10', subjects: ['Maths'], chapterIds: [] }], chapters: [{ id: 'c', subject: 'Maths', title: 'Calcul', unseenCards: 50, dueByDate: {} }], dailyMinutes, restDays: [] })
  expect(plan.days[0].items[0].newCards).toBe(maximum)
  expect(plan.exams[0].overloaded).toBe(true)
})

test('remplit les jours suivants quand un jour manque de place', () => {
  const plan = buildPlan({ today: '2026-11-09', exams: [{ id: 'a', title: 'Brevet', date: '2026-11-12', subjects: ['Maths'], chapterIds: [] }], chapters: [{ id: 'c', subject: 'Maths', title: 'Calcul', unseenCards: 9, dueByDate: {} }], dailyMinutes: 15, restDays: [], capacity: date => date === '2026-11-09' ? 0 : 10 })
  expect(plan.days.map(day => day.items.reduce((sum, entry) => sum + entry.newCards, 0))).toEqual([0, 5, 4])
  expect(plan.exams[0].overloaded).toBe(false)
})

test('avance au minimum trois cartes sans dépasser le travail restant ni la capacité', () => {
  const exam = [{ id: 'a', title: 'Brevet', date: '2026-11-19', subjects: ['Maths'], chapterIds: [] }]
  const chapter = { id: 'c', subject: 'Maths', title: 'Calcul', unseenCards: 10, dueByDate: {} }
  const base = { today: '2026-11-09', exams: exam, chapters: [chapter], dailyMinutes: 15, restDays: [] }
  expect(buildPlan(base).days[0].items[0].newCards).toBe(3)
  expect(buildPlan({ ...base, chapters: [{ ...chapter, unseenCards: 2 }] }).days[0].items[0].newCards).toBe(2)
  expect(buildPlan({ ...base, capacity: () => 1 }).days[0].items[0].newCards).toBe(1)
})

test('le plafond quotidien est partagé entre chapitres', () => {
  const plan = buildPlan({ today: '2026-11-09', exams: [{ id: 'a', title: 'Brevet', date: '2026-11-10', subjects: ['Maths'], chapterIds: [] }], chapters: [
    { id: 'c', subject: 'Maths', title: 'Calcul', unseenCards: 8, dueByDate: {} },
    { id: 'd', subject: 'Maths', title: 'Algèbre', unseenCards: 8, dueByDate: {} },
  ], dailyMinutes: 15, restDays: [] })
  expect(plan.days[0].items.reduce((sum, item) => sum + item.newCards, 0)).toBe(10)
})
