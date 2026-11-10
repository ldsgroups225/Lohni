# Lohni v1 : la boucle quotidienne de révision

Date : 2026-11-09. Statut : en attente de validation.

## Intention

Lohni est aujourd'hui une boîte à outils IA (chat, quiz, examen, planner) où l'élève doit décider quoi faire. On veut l'expérience inverse, inspirée de Knowunity : l'élève ouvre l'appli, appuie sur un bouton, révise 15 minutes ce qu'il faut réviser aujourd'hui, et referme. La mémorisation à long terme reprend le modèle d'Anki (notes, cartes, journal, répétition espacée).

Le critère de réussite : un élève qui arrive pour la première fois termine une session en moins de deux minutes, et retrouve le lendemain une session déjà prête sans rien configurer.

## Public

Collégiens et lycéens francophones d'Afrique de l'Ouest (6ᵉ à Terminale, BEPC et BAC), programme ivoirien en premier. Interface entièrement en français. Usage sur téléphone.

## Objectifs

- Un parcours d'arrivée qui mène à une première session sans compte ni import.
- Un accueil réduit à un bouton « Session du jour ».
- Un modèle de données façon Anki, planifié par FSRS, avec journal des révisions.
- Un import qui transforme un cours en chapitre complet, sans étape de validation.
- Une motivation minimale : série quotidienne, XP, maîtrise par chapitre.

## Hors périmètre de la v1

Communauté, ligues, publicité, abonnement, notifications, examens blancs au format BEPC/BAC, réinjection des examens dans le plan, dates par matière ou par contrôle, emploi du temps scolaire, paquets tout faits par programme officiel, réponse à voix haute, synchronisation entre appareils, reprise des anciennes flashcards.

## Ce qui serait un échec même si tout fonctionne

- L'élève doit choisir un outil, un paquet ou un réglage avant de pouvoir réviser.
- La classe est redemandée ailleurs qu'à l'arrivée et dans « Moi ».
- Une session après plusieurs jours d'absence dépasse le plafond.
- Une étape de relecture s'intercale entre l'import et la première révision.

## Contraintes

- **Licence.** Lohni dérive de PageLM, sous « PageLM Community License ». Elle interdit tout usage commercial (abonnement, publicité, SaaS) sans accord de partage de revenus signé avec les auteurs, et impose une attribution visible dans l'interface. La v1, gratuite, doit afficher cette attribution ; toute monétisation ultérieure exige cet accord d'abord.
- **Existant.** Backend Node, frontend React, stockage SQLite dans `storage/database.sqlite`, tests avec vitest. On construit dessus.
- **Coût IA.** Chaque import et chaque génération coûte un appel au modèle.

## Décisions prises avec le porteur du projet

### Plateforme et identité

- PWA installable sur le React actuel, pas d'application native.
- Pas de compte au départ. L'appareil crée un identifiant anonyme, envoyé à chaque requête ; la progression est stockée sur le serveur sous cet identifiant.
- Sans réseau, seule la session déjà chargée reste faisable.

### Parcours d'arrivée

1. Classe (et série au lycée). Choisie une seule fois ; modifiable uniquement dans « Moi ».
2. Matières : liste fixe par classe et série, précochée, l'élève décoche.
3. Date d'examen : une seule date globale.
4. « Tu étudies quoi en ce moment ? » : l'élève choisit une matière et tape un chapitre.
5. L'IA génère 10 cartes, marquées « générées par IA ».
6. Première session, puis invitation à importer son cours.

### Accueil et navigation

- Accueil : série, compte à rebours avant l'examen, bouton « Session du jour » avec durée et nombre de cartes estimés, maîtrise par matière.
- Barre du bas : Accueil, Cours, Tuteur, Moi.
- « Cours » liste les chapitres et leur maîtrise ; les anciens outils (examen, débat, podcast, planner, quiz libre) y sont rangés sous « Plus ».
- « Tuteur » est le chat actuel ; la boîte de prompt et les sujets à explorer de l'ancien accueil y déménagent.

### Modèle de données

```
Profil (appareil) ─ Matière ─ Chapitre ─ Note ─┬─ Carte recto-verso
                                               ├─ Carte QCM
                                               └─ (chaque carte) état FSRS
Journal des révisions : carte, date, réponse, durée
```

- Une note porte le savoir ; elle produit une ou plusieurs cartes.
- Deux types de carte : recto-verso et QCM. Les QCM sont stockés et replanifiés, jamais régénérés à la volée.
- Chaque réponse est écrite dans le journal. Le journal est la seule source pour la maîtrise, la série et les XP.
- Les cartes sauvées depuis le chat créent des notes dans ce modèle.

### Session du jour

- Composition : cartes dues, puis nouvelles cartes, puis QCM.
- Plafond : environ 20 cartes ou 15 minutes. En cas de retard, les cartes les plus fragiles passent d'abord ; un bouton « Continuer » facultatif apparaît à la fin.
- Deux boutons : « Je savais » et « Je ne savais pas ». Une erreur à un QCM vaut « Je ne savais pas ».
- Une carte ratée revient une fois dans la même session.
- Une carte ratée propose « Explique-moi », qui ouvre le Tuteur avec la carte, le chapitre et la classe en contexte.
- En session, l'élève peut supprimer une carte. La modification se fait dans « Cours ».
- Les nouvelles cartes sont dosées sur les jours restants avant l'examen. Le Planner existant reste un outil séparé.

### Import

- Formats : texte, PDF, Word, Markdown (déjà pris en charge), puis photo de cahier.
- Un import crée un chapitre complet : résumé, cartes recto-verso, cartes QCM. Aucune validation préalable.
- Limite : 3 imports par jour et par appareil.

### Motivation

- Série : avance quand une session du jour est terminée. Ni joker ni rattrapage.
- XP : par carte répondue.
- Maîtrise par chapitre : Fragile, En cours, Solide.

### Ordre de livraison

1. Notes, cartes, journal, FSRS, écran de session à deux boutons.
2. Parcours d'arrivée et accueil « Session du jour ».
3. Import texte et PDF vers un chapitre complet.
4. Onglet Cours, maîtrise, série et XP.
5. Navigation, français, « Explique-moi ».
6. Import par photo.
7. PWA installable.

Chaque étape doit être utilisable seule.

## Choix du rédacteur (non discutés, à contester si besoin)

- **Bibliothèque FSRS :** `ts-fsrs`, plutôt qu'une réécriture de l'algorithme. « Je savais » = Good, « Je ne savais pas » = Again.
- **Rétention visée :** 90 %, non exposée à l'élève.
- **Stockage :** de vraies tables SQLite via le module `backend/src/utils/database/sqlite.ts` existant, et non le magasin clé-valeur Keyv utilisé par les flashcards actuelles. La sélection des cartes dues exige des requêtes par date.
- **Nouvelles cartes par jour :** cartes jamais vues ÷ jours restants avant l'examen, arrondi au supérieur, borné entre 3 et 10. Sans date ou date passée : 5.
- **Maîtrise d'un chapitre :** moyenne de la probabilité de rappel FSRS de ses cartes déjà vues. Solide à partir de 85 %, En cours à partir de 60 %, Fragile en dessous ou si moins de la moitié des cartes ont été vues.
- **XP :** 10 par carte sue, 2 par carte non sue, 50 de bonus par session terminée.
- **Jour de série :** jour calendaire de l'appareil, envoyé par le client.
- **Identifiant anonyme :** UUID créé au premier lancement, gardé dans le stockage du navigateur, transmis dans un en-tête. Aucune protection contre l'usurpation : acceptable tant qu'aucune donnée personnelle n'est stockée.
- **Table classes → matières :** un fichier de données écrit à la main dans le dépôt, programme ivoirien. Son contenu doit être relu par quelqu'un qui connaît le programme.
- **Photo :** un modèle capable de lire les images transcrit la page, puis la chaîne d'import texte prend le relais.
- **Anciennes flashcards Keyv :** laissées en place, non reprises, plus affichées.

## Laissé au constructeur

- Schéma exact des tables, noms des routes, découpage des composants.
- Prompts de génération des cartes et des QCM, et leur validation (on peut reprendre la logique de `services/quiz`).
- Nombre de cartes générées par import selon la longueur du cours.
- Détail visuel des écrans, dans le style actuel de l'appli.
- Stratégie de cache pour la session hors ligne.

## Vérification attendue

- Tests unitaires sur la composition d'une session (ordre, plafond, retard, carte ratée qui revient une fois), sur le dosage des nouvelles cartes et sur le calcul de série.
- Un parcours manuel complet sur téléphone : arrivée, première session, import, session du lendemain.
