# Trip Planner PWA

Application web progressive (PWA) de **planification de voyage collaborative qui continue de fonctionner hors ligne** : itinéraire jour par jour sur une carte, budget partagé multi-devises, checklist de valise générée automatiquement, journal de voyage et forum communautaire avec notifications push.

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Installation et lancement](#2-installation-et-lancement)
3. [Fonctionnement hors ligne (PWA)](#3-fonctionnement-hors-ligne-pwa)
4. [Sécurité](#4-sécurité)
5. [Module Voyages (détail)](#5-module-voyages-détail)
6. [Documentation de l'équipe](#6-documentation-de-léquipe)

---

## 1. Vue d'ensemble

### Fonctionnalités

- **Voyages** : création, participants, lien de partage public, export PDF, invitations par email, assistant IA.
- **Itinéraire** : lieux répartis par jour, glisser-déposer, carte interactive, temps de trajet entre les étapes.
- **Budget** : dépenses dans n'importe quelle devise converties automatiquement, alerte à 80 % du budget, calcul de « qui doit combien à qui ».
- **Checklist** : liste de valise générée selon le type de voyage, les activités, la saison et les voyageurs.
- **Journal** : entrées datées avec photos, humeur et position GPS.
- **Forum** : recherche plein texte, votes, signalements, modération, notifications push.
- **Hors ligne** : les voyages ouverts restent lisibles et modifiables sans réseau, puis se synchronisent au retour de la connexion.

### Architecture

```
Navigateur (PWA installable)
 ├─ React / Next.js ───────► lit et écrit d'abord dans IndexedDB (Dexie)
 ├─ File d'attente "outbox" des écritures en attente de synchronisation
 └─ Service Worker (/sw.js) : cache, notifications push, Background Sync
        │   /api/v1/*  et  /uploads/*   (proxy "rewrites" de Next.js)
        ▼
API Express 5 ──► MongoDB 7 (replica set, transactions)
   ├─► Nominatim (géocodage) · OSRM (itinéraires) · open.er-api (taux de change)
   ├─► Cloudinary (optionnel) ou dossier ./uploads
   ├─► web-push (VAPID) · nodemailer (SMTP)
   └─► Fournisseur d'IA (Gemini par défaut, optionnel)
```

Le navigateur ne parle qu'à une seule origine : Next.js relaie `/api/v1` et `/uploads` vers l'API. Le cookie de rafraîchissement reste ainsi « first-party » et le service worker peut mettre en cache les lectures de l'API.

### Technologies

| Couche | Technologie | Rôle |
|---|---|---|
| Langage | TypeScript | API et front |
| API | Node.js, Express 5 | Serveur REST sous `/api/v1` |
| Base de données | MongoDB 7, Mongoose 9 | Persistance, transactions (replica set via Docker) |
| Validation | zod 4 | Toutes les entrées de l'API |
| Authentification | JWT, bcryptjs | Token d'accès court + refresh en cookie httpOnly |
| Sécurité HTTP | helmet, cors, express-rate-limit, cookie-parser | En-têtes, CORS, limitation de débit |
| Fichiers | multer, Cloudinary | Upload d'images (5 Mo max) |
| Export | pdfkit | Itinéraire en PDF |
| Notifications | web-push (VAPID) | Push navigateur |
| Email | nodemailer | Réinitialisation de mot de passe, invitations |
| Front | Next.js 16 (App Router), React 19 | Interface |
| Style | Tailwind CSS 4 | Design responsive |
| Données locales | Dexie (IndexedDB) | Copie hors ligne et file d'écritures |
| Carte | Leaflet, react-leaflet | Carte OpenStreetMap |
| Interaction | @dnd-kit | Glisser-déposer des lieux |
| Graphiques | Recharts | Budget |
| PWA | Service Worker écrit à la main, manifest | Cache, push, installation |
| Infrastructure locale | Docker Compose | MongoDB en replica set |

### Les 7 modules

| # | Module | Collection(s) | Fonctionnalité avancée |
|---|---|---|---|
| 1 | Utilisateurs | `users` | Export PDF et lien de partage public |
| 2 | **Voyages** | `trips`, `trip_invitations` | Synchronisation offline-first, invitations par email, assistant IA |
| 3 | Lieux et itinéraire | `places` | Carte interactive avec trajet quotidien |
| 4 | Dépenses | `expenses` | Conversion multi-devises et graphiques de budget |
| 5 | Checklist | `checklist_items`, `checklist_templates` | Checklist générée depuis les préférences |
| 6 | Journal | `journal_entries` | Générateur d'itinéraire par IA (prévu, non réalisé) |
| 7 | Forum | `forum_posts`, `forum_replies` | Recherche plein texte et notifications push |

### Structure du dépôt

```
trip-planner-api/        API REST
  src/config/            variables d'environnement, connexion MongoDB, transactions
  src/lib/               enveloppe de réponse, tokens, upload, push, mail, LLM, synchronisation
  src/middleware/        authentification, accès aux voyages, limiteurs, erreurs
  src/modules/           un dossier par module (users, trips, places, expenses, checklist, journal, forum, uploads)
  src/seed/              modèles de checklist et script de données de démonstration
trip-planner-web/        Front PWA Next.js
  src/app/               routes (landing, auth, trips, invite, share, forum, profile, admin)
  src/components/        coque d'application, kit d'interface, carte, formulaires, assistant, graphiques
  src/lib/               client API, authentification, IndexedDB, moteur de synchronisation, push
  public/sw.js           service worker
docs/                    spécification métier et fiches par membre (PDF)
```

---

## 2. Installation et lancement

### Prérequis

- Node.js 22 ou plus recommandé (le projet a été exécuté avec la version 20.13).
- Docker (pour MongoDB).

### Démarrage

```bash
# 1. API
cd trip-planner-api
cp .env.example .env          # puis renseigner les secrets (voir ci-dessous)
npm install
npm run vapid                 # affiche les clés Web Push à copier dans .env
docker compose up -d          # MongoDB en replica set (transactions)
npm run seed:demo             # modèles de checklist, comptes admin et démo, données de démo
npm run dev                   # http://localhost:4000/api/v1

# 2. Front (second terminal)
cd trip-planner-web
cp .env.example .env.local
npm install
npm run build && npm start    # http://localhost:3000
```

Les fonctions PWA (service worker, hors ligne, installation, push) demandent un **build de production**. Pour développer avec rechargement automatique : `npm run dev` (le service worker y est désactivé).

### Comptes créés par le seed (usage local uniquement)

| Rôle | Email | Mot de passe |
|---|---|---|
| Administrateur | `admin@tripplanner.local` | `Admin12345!` |
| Membre de démonstration | `demo@tripplanner.local` | `Demo12345!` |

Le compte de démonstration possède le voyage « Long weekend in Lisbon » (9 lieux, 4 dépenses, 1 entrée de journal, checklist générée).

### Variables d'environnement principales (`trip-planner-api/.env`)

| Variable | Usage |
|---|---|
| `PORT`, `CLIENT_ORIGIN`, `API_PUBLIC_URL` | Port de l'API, origine du front (CORS **et** liens des emails), URL publique |
| `MONGODB_URI` | Connexion MongoDB |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Secrets JWT (obligatoires en production) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Notifications push (générées par `npm run vapid`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Envoi d'emails. Sans `SMTP_HOST`, les emails s'affichent dans la console de l'API |
| `CLOUDINARY_*` | Stockage d'images (sinon dossier `./uploads`) |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` | Assistant IA. Sans clé, l'assistant est désactivé |
| `RATES_API_URL`, `OSRM_URL`, `NOMINATIM_URL` | Services externes de taux, d'itinéraire et de géocodage |

Front (`trip-planner-web/.env.local`) : `API_URL` (adresse de l'API, par défaut `http://localhost:4000`) et `NEXT_PUBLIC_ENABLE_SW` (service worker en mode développement).

Les fichiers `.env` ne sont **pas versionnés** : ne jamais y committer de secret. L'API ne relit pas `.env` à chaud : redémarrer après chaque modification.

### Scripts

| Dossier | Commande | Effet |
|---|---|---|
| API | `npm run dev` | Serveur avec rechargement automatique |
| API | `npm run build`, `npm start` | Compilation, puis exécution |
| API | `npm run typecheck` | Vérification des types |
| API | `npm run seed`, `npm run seed:demo` | Modèles et admin, puis données de démo |
| Front | `npm run dev`, `npm run build`, `npm start`, `npm run lint` | Développement, production, lint |

### Dépannage

- **`EPERM ... rmdir .next` pendant `npm run build`** : le projet est dans un dossier synchronisé par OneDrive, qui verrouille des fichiers. Supprimer `.next` puis relancer : `Remove-Item .next -Recurse -Force; npm run build`. Idéalement, placer le projet hors d'OneDrive.
- **Port déjà utilisé** : un ancien serveur tourne encore (`Get-NetTCPConnection -LocalPort 3000,4000 -State Listen`).
- **Ancienne version affichée** : recharger sans cache (`Ctrl+Shift+R`) ou désinscrire le service worker (outils de développement, onglet *Application*).

---

## 3. Fonctionnement hors ligne (PWA)

- **IndexedDB (Dexie)** conserve une copie de chaque voyage ouvert avec ses lieux, dépenses, checklist et journal. Les pages lisent toujours cette copie locale.
- **Outbox** : les créations, modifications et suppressions sont appliquées localement d'abord, puis mises en file et rejouées dans l'ordre au retour du réseau (événement `online`, test de connectivité toutes les 15 secondes, bouton de synchronisation, ou Background Sync).
- **Conflits** : dernière écriture gagnante. L'API compare `updatedAt` à `clientUpdatedAt` ; si le serveur est plus récent, elle répond `409` avec le document serveur, qui est conservé.
- **Service worker** : précache de l'application, cache des pages visitées, des ressources statiques, des tuiles de carte et des derniers posts de forum, page de repli hors ligne, notifications push, rejeu de l'outbox en arrière-plan (Chromium).
- **Limites** : le forum est en lecture seule hors ligne. Les invitations, le lien public, la couverture et l'assistant IA demandent une connexion. Sur iOS, pas de Background Sync et le push demande iOS 16.4 ou plus avec l'application installée.

---

## 4. Sécurité

- Token d'accès JWT de 15 minutes gardé en mémoire ; refresh de 7 jours en cookie httpOnly, **tourné à chaque usage**, avec détection de réutilisation (toutes les sessions sont alors révoquées).
- Mots de passe hachés avec bcrypt (coût 12) ; jeton de réinitialisation stocké haché (SHA-256), valable 1 heure.
- Toutes les entrées validées avec zod ; recherches par expression régulière échappées ; champs de tri limités à une liste blanche.
- Contrôle d'accès par appartenance au voyage (`owner` ou `editor`) ; rôles `member` et `admin` pour le reste.
- helmet, CORS restreint à `CLIENT_ORIGIN`, limitation de débit (300 requêtes par minute en général, 20 tentatives par 15 minutes pour l'authentification, 20 invitations par heure, 40 échanges d'assistant IA par 15 minutes).
- Les secrets (JWT, SMTP, clé d'IA) restent côté serveur.

---

## 5. Module Voyages (détail)

### 5.1 Rôle du module

Le module Voyages est le **pivot du projet** : tout le reste (lieux, dépenses, checklist, journal) est rattaché à un voyage et protégé par l'appartenance à ce voyage. Il gère le cycle de vie d'un voyage, ses participants, son partage et sa création assistée par IA.

### 5.2 Rôles et droits

| Action | Visiteur | Participant (`editor`) | Propriétaire (`owner`) |
|---|:-:|:-:|:-:|
| Voir et modifier le voyage (détails, préférences, couverture) | ❌ | ✅ | ✅ |
| Exporter l'itinéraire en PDF | ❌ | ✅ | ✅ |
| Quitter le voyage | ❌ | ✅ | ❌ (il doit le supprimer) |
| Inviter, retirer un participant | ❌ | ❌ | ✅ |
| Créer ou révoquer le lien public | ❌ | ❌ | ✅ |
| Voir et annuler les invitations en attente | ❌ | ❌ | ✅ |
| Supprimer le voyage | ❌ | ❌ | ✅ |
| Voir l'itinéraire via le lien public | ✅ | ✅ | ✅ |

L'invité devient toujours `editor`.

### 5.3 Modèle de données

**`trips`** : `title` (2 à 120 caractères), `destination`, `country` (code ISO à 2 lettres), `startDate`, `endDate`, `budget` (0 à 10 000 000), `baseCurrency` (3 lettres), `coverUrl`, `owner`, `members[]` (`user`, `role`, `joinedAt`), `shareToken` (64 caractères hexadécimaux, absent tant que le lien n'est pas créé) et `preferences` :

| Préférence | Valeurs |
|---|---|
| `tripType` | beach, mountain, city break, road trip, camping, business, pilgrimage |
| `activities` | hiking, swimming, diving, photography, skiing, nightlife, museums |
| `accommodation` | hotel, hostel, apartment, tent, family |
| `transport` | plane, car, train, bus |
| `travellers` | adultes, enfants, bébés (0 à 50 chacun) |
| `specialNeeds` | with a baby, formal event, driving abroad, modest dress required |

Index : `members.user` (liste « mes voyages ») et `shareToken` (unique, partiel).

**`trip_invitations`** : `trip`, `email`, `invitedBy`, `tokenHash` (SHA-256 du jeton, unique), `status` (`pending` ou `accepted`), `expiresAt`. Un index unique `(trip, email)` garantit une seule invitation par voyage et par adresse. Un index TTL sur `expiresAt` fait supprimer les invitations expirées par MongoDB.

### 5.4 API

Toutes les réponses suivent l'enveloppe `{ data, message, errors }`.

| Méthode et chemin | Accès | Description |
|---|---|---|
| `GET /trips` | participant | Mes voyages. Pagination (20 par défaut, 100 maximum), recherche `q`, tri `startDate`, `createdAt`, `updatedAt` ou `title` |
| `POST /trips` | connecté | Crée un voyage et génère sa checklist dans **une transaction**. Accepte un `_id` client (rejeu idempotent) |
| `GET /trips/:id` | participant | Voyage avec ses participants |
| `GET /trips/:id/full` | participant | Voyage, lieux, dépenses, checklist et journal en un seul appel, pour la copie hors ligne |
| `PATCH /trips/:id` | participant | Modification avec contrôle de conflit (`clientUpdatedAt`, réponse `409`). Régénère la checklist si préférences, dates ou pays changent |
| `DELETE /trips/:id` | owner | Suppression en cascade dans une transaction |
| `POST /trips/:id/cover` | participant | Image de couverture (5 Mo maximum) |
| `POST /trips/:id/members` | owner | Invite par email (voir 5.6) |
| `DELETE /trips/:id/members/:userId` | owner, ou la personne elle-même | Retire un participant ou quitte le voyage |
| `POST` / `DELETE /trips/:id/share` | owner | Crée ou révoque le lien public |
| `GET /share/:token` | public | Itinéraire en lecture seule (sans budget, journal ni checklist) |
| `GET /trips/:id/export` | participant | Itinéraire en PDF |
| `GET /trips/:id/invitations` | owner | Invitations en attente |
| `DELETE /trips/:id/invitations/:invitationId` | owner | Annule une invitation |
| `GET /invitations/:token` | public | Aperçu d'une invitation (le jeton est le secret) |
| `POST /invitations/:token/accept` | connecté | Rejoint le voyage (l'email du compte doit être l'adresse invitée) |
| `GET /ai/status` | public | Indique si l'assistant IA est configuré |
| `POST /ai/trip-assistant` | connecté | Un tour de conversation de l'assistant (voir 5.7) |

### 5.5 Règles métier

- Une date de fin ne peut pas précéder la date de début.
- La création est transactionnelle : le voyage et sa checklist sont créés ensemble, sinon rien.
- La checklist est resynchronisée quand les préférences, les dates ou le pays changent. Les éléments édités ou cochés par les utilisateurs ne sont jamais supprimés.
- La suppression d'un voyage supprime en cascade ses lieux, dépenses, éléments de checklist, entrées de journal et invitations, dans une transaction.
- Le propriétaire ne peut pas quitter son propre voyage.
- Le lien public est un jeton aléatoire de 32 octets, révocable à tout moment.
- Supprimer un compte supprime ses voyages et le retire des autres.

### 5.6 Fonctionnalités avancées

#### a) Synchronisation offline-first

Création, modification et suppression de voyages fonctionnent hors ligne (voir la section 3). Les identifiants sont générés côté client, ce qui rend le rejeu d'une création sans doublon. `GET /trips/:id/full` télécharge un voyage complet pour la copie locale.

#### b) Invitations par email

```
Propriétaire saisit un email ──► POST /trips/:id/members
        │
        ├─ le compte existe ───────► ajouté immédiatement (rôle editor)
        └─ aucun compte ───────────► invitation en attente + email avec lien
                                         │
   Invité ouvre /invite/<jeton> ◄────────┘
        ├─ pas connecté ──► « Create my account » (email pré-rempli) ou « Log in »
        └─ connecté avec la bonne adresse ──► « Join this trip » ──► rôle editor
```

- Le jeton fait 32 octets aléatoires ; **seul son hash est stocké**. Il est à usage unique et valable 7 jours.
- Le compte qui accepte doit avoir **exactement l'adresse invitée**, sinon réponse `403`.
- Renvoyer une invitation **invalide l'ancien lien**. Maximum 20 invitations en attente par voyage.
- Un compte désactivé est refusé (`409`).
- L'inscription et la connexion conservent le paramètre `next`, pour revenir sur l'invitation.
- Interface : section « Pending invitations » dans les réglages du voyage (une ligne de résumé, liste complète avec *Resend* et *Cancel* dans une fenêtre).
- Envoi : nodemailer via SMTP. En cas d'échec d'envoi, l'invitation reste enregistrée et le bouton *Resend* permet de réessayer.

#### c) Assistant IA de création de voyage

Sur **« New trip »**, l'utilisateur choisit entre l'assistant IA et le formulaire manuel.

1. L'assistant ouvre par « Where is your trip? » ; l'utilisateur décrit librement son voyage.
2. L'assistant ne pose que les questions nécessaires, **une à la fois**, dans cet ordre : destination, dates exactes, voyageurs, budget. Il déduit le reste (titre, type de voyage, activités, hébergement, transport, besoins spéciaux, devise).
3. Quand tout est connu, une **carte récapitulative** apparaît avec *Create trip*, *Edit in the form* (formulaire pré-rempli) ou une demande de modification dans le chat.
4. **Le voyage n'est créé qu'au clic de l'utilisateur** : l'IA remplit un brouillon, elle ne crée rien.

Choix de conception :

- **Le serveur décide si le voyage est complet**, pas le modèle (`missingFields`). Chaque champ renvoyé par l'IA est revalidé individuellement (listes autorisées, dates réelles et futures, code pays valide, nombres bornés). Un champ invalide devient « manquant ».
- Si le modèle se déclare « prêt » trop tôt, ou renvoie une date passée, le serveur le relance une fois avec l'erreur ; en dernier recours, une question de secours est posée.
- Le serveur est sans état : le client renvoie la conversation (30 messages de 1 000 caractères au maximum) et le brouillon à chaque tour.
- Les instructions glissées dans les messages de l'utilisateur sont ignorées : l'IA ramène la conversation vers le voyage.
- Une couche neutre (`lib/llm.ts`) gère plusieurs fournisseurs ; la clé reste côté serveur.

| `AI_PROVIDER` | Notes |
|---|---|
| `gemini` (défaut) | Offre gratuite Google AI Studio. Modèle par défaut `gemini-3.5-flash-lite` |
| `groq`, `openrouter` | Compatibles OpenAI, offres gratuites limitées |
| `ollama` | Modèle local, sans clé |
| `openai-compatible` | Tout serveur compatible, avec `AI_BASE_URL` et `AI_MODEL` |

Sans clé, ou hors ligne, l'option IA est grisée et le formulaire manuel reste disponible. Les quotas gratuits sont limités : l'API affiche « free quota reached » en cas de dépassement et réessaie une fois sur les erreurs passagères.

#### Services hébergés dans ce module

L'**export PDF** de l'itinéraire (pdfkit, généré côté serveur) et le **lien de partage public** sont implémentés dans `modules/trips/` ; le tableau des modules les rattache à la fonctionnalité avancée du module Utilisateurs.

### 5.7 Interface

| Route | Contenu |
|---|---|
| `/trips` | Liste des voyages : couverture, badge *Past / Ongoing / Upcoming*, badge *Not synced*, nombre de participants. Lue depuis IndexedDB |
| `/trips/new` | Choix entre l'assistant IA et le formulaire manuel |
| `/trips/[id]` | Vue d'ensemble : statistiques, jour par jour, participants, préférences, export PDF, fenêtre « Invite people » |
| `/trips/[id]/settings` | Résumé des détails (« See more & edit » ouvre le formulaire complet), couverture, participants et invitations, lien public, suppression |
| `/invite/[token]` | Acceptation d'une invitation |
| `/share/[token]` | Itinéraire public en lecture seule |

L'espace du voyage (`trips/[id]/layout.tsx`) affiche l'en-tête et les six onglets (Overview, Itinerary, Budget, Checklist, Journal, Settings), gère les cas « non disponible hors ligne » et « introuvable », et fournit un contexte partagé aux sous-pages.

### 5.8 Fichiers du module

| Côté | Fichiers |
|---|---|
| API | `modules/trips/trip.model.ts`, `trip.routes.ts`, `trip.service.ts`, `export.pdf.ts`, `invitation.model.ts`, `invitation.service.ts`, `invitation.routes.ts`, `assistant.service.ts`, `assistant.routes.ts` ; `middleware/tripAccess.ts` ; `lib/llm.ts`, `lib/mailer.ts`, `lib/sync.ts` |
| Front | `app/trips/**`, `app/invite/[token]/page.tsx`, `app/share/[token]/page.tsx` ; `components/trips/TripForm.tsx`, `TripAssistant.tsx`, `InviteForm.tsx`, `PendingInvitations.tsx`, `TripContext.tsx` ; `lib/sync.ts`, `lib/db.ts`, `lib/hooks.ts` ; `public/sw.js` |

### 5.9 Configuration propre au module

```env
# Emails d'invitation (exemple Gmail avec mot de passe d'application)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=adresse@gmail.com
SMTP_PASS=<mot de passe d'application, sans espaces>
MAIL_FROM=Trip Planner <adresse@gmail.com>
CLIENT_ORIGIN=http://localhost:3000   # utilisé dans les liens d'invitation

# Assistant IA
AI_PROVIDER=gemini
AI_API_KEY=<clé créée sur https://aistudio.google.com>
```

Le lien des emails pointe vers `CLIENT_ORIGIN` : pour qu'un invité l'ouvre depuis un autre appareil, l'application doit être accessible publiquement et cette variable doit contenir son adresse.

### 5.10 Tests et vérifications

Le dépôt **ne contient pas de tests automatisés**. Ont été effectués :

- vérification des types (`tsc --noEmit`) et lint sur l'API et le front, build de production ;
- scénarios d'API scriptés, non versionnés : invitations (envoi, aperçu, mauvais compte, inscription puis acceptation, réutilisation du lien, renvoi, annulation, droits `editor` et `owner`) ;
- assistant IA : scénarios d'erreur avec un faux modèle sur les formats Gemini et compatible OpenAI, puis conversations réelles avec Gemini en anglais et en français, y compris une tentative de détournement ;
- essais manuels dans l'interface.

### 5.11 Limites connues et pistes

- **Dates raccourcies** : réduire la durée d'un voyage ne replanifie pas les lieux dont le jour dépasse la nouvelle durée. La page *Itinerary* n'affiche que les jours existants. À vérifier et corriger.
- **Un seul rôle d'écriture** : tout invité est `editor` ; pas de rôle lecture seule ni de transfert de propriété.
- **Compte existant ajouté sans accord** : l'ajout est immédiat et sans notification ; la personne peut seulement quitter le voyage.
- **Lien public sans expiration** ni mot de passe.
- **Assistant IA** : dépend d'un service externe et de son quota gratuit ; un modèle gratuit peut mal interpréter une phrase ambiguë, d'où le récapitulatif à valider.
- **Emails en texte brut**, avec un lien qui pointe vers `localhost` en développement.
- **Pistes** : rôle lecture seule, invitations avec acceptation explicite, résolution de conflits avec comparaison des versions, rappels push avant le départ, météo de la destination, tests automatisés.

---

## 6. Documentation de l'équipe

Le dossier [`docs/`](docs) contient la spécification métier (`Trip-Planner-Modules-Logique-Metier.pdf`) et les fiches de chaque membre (`fiches-membres/Membre-1-Utilisateurs.pdf` à `Membre-7-Forum.pdf`). Les README détaillés de chaque partie : [`trip-planner-api/README.md`](trip-planner-api/README.md) et [`trip-planner-web/README.md`](trip-planner-web/README.md).
