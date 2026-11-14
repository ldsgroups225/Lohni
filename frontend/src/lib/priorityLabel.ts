// Priority 1-5 from the planner, as plain French for students.
export const priorityLabel = (priority: number) => priority >= 4 ? 'À faire en priorité' : priority === 3 ? 'Assez important' : 'Peut attendre'
