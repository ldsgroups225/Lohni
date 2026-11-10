# Le rebranding ne renomme pas les identifiants techniques

Le rebranding ne touche que ce que l'élève ou le lecteur du dépôt voit. Les identifiants invisibles gardent leur nom, même quand ce nom est « pagelm » : les renommer ferait perdre des données pour un gain nul à l'écran.

Restent inchangés :

- l'espace `pagelm` de l'index de documents (valeur par défaut dans `upload.ts`, `ask.ts`, `Ragsearch.ts`) : le renommer rendrait introuvables les cours déjà importés ;
- les clés `localStorage` `lohni-device-id` et `lohni-revision-offline:*` : les renommer ferait perdre sa progression à chaque élève ;
- le préfixe de cache `lohni-shell-` du service worker et les tables SQLite `revision_*`.

Si le nom de l'appli change un jour, ces identifiants ne suivent pas sans migration écrite et testée.
