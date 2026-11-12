# Le plan de révision vit dans le service de révision

Le plan, les examens, l'emploi du temps et les réglages de l'élève vivent dans `backend/src/services/revision/`, pas dans le planner hérité de PageLM. Le service de révision est déjà lié à l'appareil, testé, et possède les chapitres, les cartes, le calendrier FSRS et `policy.ts` ; le planner stocke ses tâches dans une liste globale, sans test, et n'est accessible que depuis « Cours ».

## Conséquences

- La séance du jour et le plan partagent le même calcul : ce que le plan affiche est ce que la séance propose.
- Le planner reste un outil de devoirs séparé ; il ne lit ni n'écrit le plan. Ses défauts sont suivis à part (#42).
- Spec : #36.
