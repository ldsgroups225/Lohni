# Lohni

**La connaissance, un peu chaque jour.**

Lohni est une application de révision quotidienne pour les collégiens et lycéens d’Afrique de l’Ouest francophone, d’abord en Côte d’Ivoire. Son nom signifie « connaissance » en malinké (dioula).

À partir de cours et de documents, Lohni aide les élèves à créer des cartes, à réviser chaque jour et à suivre leur progression. L’application propose aussi un tuteur, des quiz, des notes et des podcasts.

## Installation locale

Prérequis : Node.js 21.18 ou plus récent, npm et ffmpeg pour les podcasts.

```bash
git clone https://github.com/ldsgroups225/Lohni.git
cd Lohni
npm install
npm install --prefix frontend --package-lock=false
cp .env.example .env
```

Renseignez les paramètres et les clés nécessaires dans `.env`, puis lancez le serveur et l’interface dans deux terminaux :

```bash
npx tsx backend/src/core/index.ts
```

```bash
cd frontend
npx vite --host 127.0.0.1 --port 5173
```

Ouvrez ensuite http://127.0.0.1:5173. Le serveur écoute sur le port 5000. Pour les autres options, consultez `.env.example`.

## Vérifications

```bash
npm test
npx vitest run frontend/src
npm run build
npm run build --prefix frontend
```

## API de révision Lohni

Les routes `/revision/*` attendent `X-Device-Id` (UUID anonyme conservé sur l’appareil) et `X-Local-Date` (jour local au format `YYYY-MM-DD`). Le jour local doit rester à un jour au plus de la date UTC du serveur, sinon la réponse est HTTP 400 avec le code JSON `REVISION_LOCAL_DATE_OUT_OF_RANGE` ; cette règle s’applique aussi aux réponses hors ligne envoyées plus tard. La synchronisation retire une réponse de la file si elle reçoit ce code en HTTP 400 et poursuit avec la suivante : cette réponse ne compte plus dans la progression. Toute autre erreur conserve la file pour un nouvel essai. Les réponses JSON ont la forme `{ ok: true, data }` ou `{ ok: false, error, code? }`.

| Méthode | Route | Usage |
| --- | --- | --- |
| GET / PUT | `/revision/profile` | Lire ou enregistrer classe, matières, série et date d’examen |
| GET | `/revision/home`, `/revision/progress` | Accueil, maîtrise, série et XP |
| GET / POST | `/revision/chapters` | Lister les chapitres ou générer un chapitre IA (`title`, `subject`) |
| DELETE | `/revision/chapters/:id` | Supprimer un chapitre et ses cartes |
| POST | `/revision/notes` | Sauver une carte du Tuteur (`title`, `subject`, `question`, `answer`) |
| GET | `/revision/import/quota` | Imports restants et prochaine recharge UTC |
| POST | `/revision/import` | Importer du texte (`title`, `subject`, `text`) ou un fichier multipart (`q` : JSON titre/matière, `file`) |
| GET | `/revision/session` | Charger ou reprendre la session du jour |
| POST | `/revision/session/continue` | Continuer avec les cartes restantes |
| POST | `/revision/session/answer` | Répondre (`sessionId`, `cardId`, `position`, `knew`, `durationMs`, `choice` pour un QCM, UUID `answerId` pour le rejeu sans doublon) |
| PUT / DELETE | `/revision/cards/:id` | Corriger une carte (`kind`, `question`, `answer`, `options` et `correct` pour un QCM) ou la supprimer |

Les limites d’import et de génération, le dosage des nouvelles cartes et les XP sont regroupés dans `backend/src/services/revision/policy.ts`, également utilisé par le frontend.

## Licence et crédit

Lohni est dérivé de [PageLM](https://github.com/CaviraOSS/PageLM), créé par nullure et recabasic (CaviraOSS). Consultez la [licence](LICENSE.md) pour les conditions d’utilisation et de redistribution. Lohni reste gratuit et non commercial : tout usage commercial nécessite un accord préalable avec les auteurs de PageLM.

Pour contribuer, consultez [CONTRIBUTING.md](CONTRIBUTING.md) et les [issues du dépôt](https://github.com/ldsgroups225/Lohni/issues).
