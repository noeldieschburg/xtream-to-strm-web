# Plex Streaming URLs - Documentation

## Vue d'ensemble

Plex propose plusieurs types d'URLs pour accéder au contenu média. Cette documentation couvre les différentes méthodes et paramètres disponibles.

## Types d'URLs

### 1. Accès Direct au Fichier

```
{server_uri}/library/parts/{part_id}/{timestamp}/file.{ext}?X-Plex-Token={token}
```

**Exemple :**
```
https://85-201-177-168.xxx.plex.direct:32400/library/parts/84222/1713738550/file.mkv?X-Plex-Token=abc123
```

**Limitations :**
- ❌ Ne fonctionne PAS avec les serveurs partagés (erreur 403 Forbidden)
- ✅ Fonctionne uniquement avec les serveurs dont tu es propriétaire
- ✅ Pas de transcodage, fichier original

---

### 2. URL de Transcodage Universel (HLS)

```
{server_uri}/video/:/transcode/universal/start.m3u8?{params}
```

**Exemple :**
```
https://85-201-177-168.xxx.plex.direct:32400/video/:/transcode/universal/start.m3u8?path=%2Flibrary%2Fmetadata%2F36578&mediaIndex=0&partIndex=0&X-Plex-Token=abc123
```

**Avantages :**
- ✅ Fonctionne avec les serveurs partagés
- ✅ Contrôle sur le transcodage
- ✅ Compatible avec la plupart des lecteurs (Jellyfin, mpv, VLC)

---

### 3. URL de Transcodage Universel (DASH)

```
{server_uri}/video/:/transcode/universal/start.mpd?{params}
```

Même structure que HLS mais retourne un manifest DASH au lieu de HLS.

---

## Paramètres de l'URL de Transcodage

### Paramètres Obligatoires

| Paramètre | Description | Exemple |
|-----------|-------------|---------|
| `path` | Chemin vers le média (URL-encoded) | `%2Flibrary%2Fmetadata%2F36578` |
| `X-Plex-Token` | Token d'authentification | `abc123xyz` |

### Paramètres de Lecture

| Paramètre | Valeurs | Description |
|-----------|---------|-------------|
| `mediaIndex` | `0`, `1`, ... | Index du média (si plusieurs versions) |
| `partIndex` | `0`, `1`, ... | Index de la partie (si fichier split) |
| `offset` | `0`, `30000`, ... | Position de départ en millisecondes |

### Paramètres de Transcodage

| Paramètre | Valeurs | Description |
|-----------|---------|-------------|
| `directPlay` | `0` / `1` | `1` = Lecture directe sans transcodage |
| `directStream` | `0` / `1` | `1` = Remux seulement (pas de ré-encodage vidéo) |
| `protocol` | `hls` / `dash` | Protocole de streaming |
| `fastSeek` | `0` / `1` | Seek rapide activé |
| `copyts` | `0` / `1` | Copier les timestamps |

### Paramètres de Qualité Vidéo

| Paramètre | Valeurs | Description |
|-----------|---------|-------------|
| `maxVideoBitrate` | `2000` - `40000` | Bitrate max en kbps |
| `videoQuality` | `1` - `100` | Qualité vidéo (100 = max) |
| `videoResolution` | `1920x1080`, `1280x720` | Résolution cible |

**Presets de bitrate courants :**
- `2000` = 720p basse qualité
- `4000` = 720p
- `8000` = 1080p
- `12000` = 1080p haute qualité
- `20000` = 4K
- `40000` = 4K haute qualité

### Paramètres Audio

| Paramètre | Valeurs | Description |
|-----------|---------|-------------|
| `directStreamAudio` | `0` / `1` | `1` = Audio sans transcodage |
| `audioBoost` | `0` - `300` | Boost audio en % (100 = normal) |

### Paramètres de Sous-titres

| Paramètre | Valeurs | Description |
|-----------|---------|-------------|
| `subtitles` | `burn` / `sidecar` / `none` | Mode sous-titres |
| `subtitleSize` | `50` - `200` | Taille des sous-titres (100 = normal) |

- `burn` = Incrustés dans la vidéo (nécessite transcodage)
- `sidecar` = Fichier séparé
- `none` = Pas de sous-titres

### Paramètres d'Identification Client

| Paramètre | Description | Exemple |
|-----------|-------------|---------|
| `X-Plex-Client-Identifier` | ID unique du client | `xtream-to-strm` |
| `X-Plex-Product` | Nom du produit | `Xtream to STRM` |
| `X-Plex-Platform` | Plateforme | `Chrome`, `Generic` |
| `X-Plex-Device` | Type d'appareil | `Linux`, `Windows` |

### Autres Paramètres

| Paramètre | Valeurs | Description |
|-----------|---------|-------------|
| `location` | `lan` / `wan` | Type de connexion |
| `mediaBufferSize` | `102400` | Taille du buffer en KB |
| `addDebugOverlay` | `0` / `1` | Overlay de debug |
| `Accept-Language` | `en`, `fr` | Langue préférée |

---

## Combinaisons Recommandées

### Direct Play (Qualité Maximale, Serveur Propriétaire)

```
directPlay=1&directStream=1
```
- Fichier original, aucun traitement
- ⚠️ Ne fonctionne pas avec serveurs partagés

### Direct Stream / Remux (Recommandé)

```
directPlay=0&directStream=1&directStreamAudio=1
```
- Remux le conteneur si nécessaire
- Pas de ré-encodage vidéo/audio
- Rapide, charge minimale sur le serveur

### Transcodage Complet

```
directPlay=0&directStream=0&maxVideoBitrate=8000
```
- Ré-encode vidéo et audio
- Utile si le client ne supporte pas le codec
- Charge importante sur le serveur Plex

### Optimisé pour Bande Passante Limitée

```
directPlay=0&directStream=0&maxVideoBitrate=4000&videoResolution=1280x720
```
- Force 720p à 4 Mbps
- Bon pour connexions lentes

---

## URL Complète Exemple

```
https://85-201-177-168.aad15d2114bc4ed79cc632ab1354bac6.plex.direct:32400/video/:/transcode/universal/start.m3u8?path=%2Flibrary%2Fmetadata%2F36578&mediaIndex=0&partIndex=0&protocol=hls&fastSeek=1&directPlay=0&directStream=1&directStreamAudio=1&location=wan&X-Plex-Client-Identifier=xtream-to-strm&X-Plex-Product=Xtream-STRM&X-Plex-Platform=Generic&X-Plex-Token=YOUR_TOKEN_HERE
```

---

## Obtenir le Rating Key

Le `rating_key` est l'identifiant unique d'un média dans Plex.

### Via l'interface Web Plex

1. Ouvre plex.tv/web
2. Navigue vers le média
3. Regarde l'URL : `...details?key=%2Flibrary%2Fmetadata%2F**36578**`
4. Le nombre (`36578`) est le rating_key

### Via l'API Python (plexapi)

```python
from plexapi.myplex import MyPlexAccount

account = MyPlexAccount(token="YOUR_TOKEN")
plex = account.resource("SERVER_NAME").connect()
item = plex.library.section("Films").get("Là-haut")
print(item.ratingKey)  # 36578
```

### Via l'API REST

```bash
curl "https://SERVER_URI/library/sections/1/all?X-Plex-Token=TOKEN" \
  -H "Accept: application/json"
```

---

## Tokens Plex

### Types de Tokens

| Type | Usage | Durée |
|------|-------|-------|
| Account Token | Authentification compte plex.tv | Long terme |
| Server Token | Accès à un serveur spécifique | Variable |
| Session Token | Session de lecture active | Temporaire |

### Obtenir son Token

**Via plexapi :**
```python
from plexapi.myplex import MyPlexAccount
account = MyPlexAccount(username, password)
print(account.authenticationToken)
```

**Via l'interface Web :**
1. Ouvre les DevTools (F12)
2. Onglet Network
3. Cherche une requête vers plex.tv
4. Le token est dans les headers ou l'URL

---

## Serveurs Partagés vs Propriétaires

| Fonctionnalité | Serveur Propriétaire | Serveur Partagé |
|----------------|---------------------|-----------------|
| Accès direct fichier | ✅ | ❌ (403 Forbidden) |
| URL transcodage | ✅ | ✅ |
| Download | ✅ | ❌ |
| Sync | ✅ | Dépend des permissions |

**Important :** Pour les serveurs partagés, seules les URLs de transcodage (`/video/:/transcode/universal/...`) fonctionnent.

---

## Architecture Proxy Xtream-to-STRM

### Pourquoi un Proxy ?

Les fichiers STRM contiennent une URL de streaming. Pour Plex, cette URL nécessite un token d'authentification (`X-Plex-Token`). Problèmes :

1. **Sécurité** : Le token Plex donne accès complet au compte → exposer le token dans un fichier STRM est risqué
2. **Maintenance** : Si le token change, tous les fichiers STRM deviennent invalides
3. **Partage** : Impossible de partager les fichiers STRM sans exposer le token

### Solution : Endpoint Proxy

L'application expose un endpoint proxy qui :
1. Reçoit une requête avec l'ID du serveur et du média
2. Vérifie l'authentification via une clé partagée (optionnelle)
3. Redirige (HTTP 302) vers l'URL Plex avec le token

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Jellyfin  │────▶│  Proxy Endpoint  │────▶│   Plex Server   │
│   (STRM)    │     │  /api/v1/plex/   │     │  (transcode)    │
└─────────────┘     │  proxy/{id}/{key}│     └─────────────────┘
                    └──────────────────┘
```

### Endpoint Proxy

```
GET /api/v1/plex/proxy/{server_id}/{rating_key}
```

**Paramètres URL :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `server_id` | int | ID du serveur dans la base de données |
| `rating_key` | int | Rating key Plex du média |

**Paramètres Query :**

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `key` | string | - | Clé d'authentification partagée |
| `direct_play` | int | `0` | `1` = Direct play uniquement |
| `direct_stream` | int | `1` | `1` = Remux sans ré-encodage |

**Exemple d'URL dans un fichier STRM :**

```
http://192.168.1.100:8000/api/v1/plex/proxy/1/36578?key=ma_cle_secrete
```

**Réponse :**
- HTTP 302 Redirect vers l'URL Plex de transcodage

---

## Configuration

### Paramètres dans l'interface Administration

| Paramètre | Description |
|-----------|-------------|
| **PLEX_PROXY_BASE_URL** | URL de base pour le proxy (ex: `http://192.168.1.100:8000`) |
| **PLEX_SHARED_KEY** | Clé secrète pour protéger l'endpoint proxy (optionnelle) |

### PLEX_PROXY_BASE_URL

Cette URL est utilisée dans les fichiers STRM générés. Elle doit être accessible par le serveur média (Jellyfin/Kodi).

**Exemples :**
- LAN : `http://192.168.1.100:8000`
- Docker : `http://xtream-to-strm:8000`
- Externe : `https://media.example.com`

⚠️ **Ne pas utiliser `localhost`** - Jellyfin ne pourra pas atteindre l'application.

### PLEX_SHARED_KEY

Clé optionnelle pour protéger l'endpoint proxy contre les accès non autorisés.

**Comportement :**
- Si vide : L'endpoint est accessible sans authentification
- Si définie : Le paramètre `key` doit correspondre à la clé configurée

**Sécurité :**
```
# Sans clé (accès libre)
http://192.168.1.100:8000/api/v1/plex/proxy/1/36578

# Avec clé (authentification requise)
http://192.168.1.100:8000/api/v1/plex/proxy/1/36578?key=ma_cle_secrete_tres_longue
```

⚠️ **Important :** Si vous modifiez la clé partagée après avoir généré les fichiers STRM, vous devez relancer la synchronisation Plex pour mettre à jour toutes les URLs.

---

## Flux de Synchronisation Plex

1. **L'utilisateur déclenche une sync** depuis `/plex/selection`
2. **La tâche Celery** récupère les films/séries depuis l'API Plex
3. **Pour chaque média**, génère :
   - URL proxy : `{PLEX_PROXY_BASE_URL}/api/v1/plex/proxy/{server_id}/{rating_key}?key={PLEX_SHARED_KEY}`
   - Fichier STRM avec cette URL
   - Fichier NFO avec les métadonnées
4. **Les fichiers sont écrits** dans `{output_dir}/plex/{server_name}/movies/` ou `series/`

### Structure des Fichiers Générés

```
/output/plex/
└── YatooHS/
    ├── movies/
    │   └── Action/
    │       └── Avatar (2009) {tmdb-19995}/
    │           ├── Avatar (2009) {tmdb-19995}.strm  ← URL proxy
    │           └── Avatar (2009) {tmdb-19995}.nfo   ← Métadonnées
    └── series/
        └── Drama/
            └── Breaking Bad (2008) {tmdb-1396}/
                ├── tvshow.nfo
                └── Season 01/
                    ├── S01E01 - Pilot.strm
                    └── S01E01 - Pilot.nfo
```

### Contenu d'un Fichier STRM

```
http://192.168.1.100:8000/api/v1/plex/proxy/1/36578?key=ma_cle_secrete
```

Quand Jellyfin ouvre ce fichier :
1. Requête GET vers le proxy
2. Le proxy vérifie la clé
3. Redirection 302 vers Plex avec le token
4. Jellyfin lit le flux HLS transcodé

---

## Références

- [Plex Media Server API](https://github.com/Arcanemagus/plex-api/wiki)
- [python-plexapi Documentation](https://python-plexapi.readthedocs.io/)
- [Plex Support](https://support.plex.tv/)
