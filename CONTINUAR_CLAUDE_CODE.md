# MotoRide — continuar en Claude Code (terminal)

> Abre una terminal en esta carpeta, ejecuta `claude` y di: **«Lee CONTINUAR_CLAUDE_CODE.md y sigue con los pendientes»**.
> Última sesión: 2026-11-25. Historial de cambios anterior en `CONTEXTO_APP.txt`.

## Qué es y cómo está desplegado

- PWA de rutas en moto en grupo (React 19 + Vite + Tailwind + Leaflet + Firebase).
- **Web**: Cloudflare Workers (solo estáticos de `dist/`) → https://motobike.juarp123.workers.dev — `wrangler.jsonc`.
- **Tiempo real** (posiciones, avisos, señalización de voz): `server.ts` (Express + Socket.IO) en Render → https://motoride-socket.onrender.com
- **Firebase** proyecto `motoapp-3e6c6`: Auth Google, Firestore (`firestore.rules`), Cloud Functions (`functions/src/index.ts`), FCM.
- La app Android (Capacitor) **se ha quitado** (estaba en la Papelera de reciclaje si hiciera falta).

## Cambios de esta sesión (2026-11-25)

1. **Mapa en blanco «API KEY REQUIRED»**: Carto Voyager ya exige API key y OSM bloquea apps.
   Ahora el mapa base es **Esri World Street Map** (sin clave). Centralizado en `src/lib/leafletTiles.ts`
   (`BASE_MAP_TILE_URL`, configurable con `VITE_MAP_TILE_URL`). Caché de teselas a `map-tiles-v4` en `public/sw.js`
   y `src/lib/mapTileCache.ts` para descartar las teselas malas guardadas.
2. **Inclinómetro en iPhone** (`src/hooks/useLeanAngle.ts`, `src/lib/motorcycleLean/`):
   - iOS entrega `accelerationIncludingGravity` con el **signo invertido** respecto a W3C → izquierda/derecha cambiadas
     y término cinemático incoherente. Nuevo `AccelSignDetector` (`deviceScreenFrame.ts`): parte del valor de la
     plataforma y lo confirma en vivo con `deviceorientation` (β, γ).
   - El giroscopio integraba un **eje arbitrario** (con el móvil en el manillar, el de cabeceo). Nuevo
     `leanRateRadFromGyro` (`geometry.ts`) usa el mismo eje que mide el acelerómetro (fila 1 de `R_align`).
   - Quitado el «volteo» del término cinemático que fallaba en curva coordinada.
   - ⚠️ **Sin probar en moto real**: verificar signo (derecha = positivo) y estabilidad en curva.
3. **Chat de voz** (`src/hooks/useVoiceChat.ts`, `src/lib/webrtcPeerConfig.ts`, `server.ts`):
   - Reconexión **por enlace** con reintentos crecientes + vigilante (failed / disconnected > 7 s / sin conectar en 20 s).
   - Arreglada carrera: el `close` de un peer viejo borraba al nuevo con el mismo id.
   - Ofertas nuevas sobre enlace existente → se rehace limpio (antes se colgaba al volver de segundo plano).
   - Servidor: `disconnecting` avisa `user-left-voice`; nuevo evento `voice-peer-reset`; endpoint `GET /ice-servers`
     para **TURN** (Cloudflare Realtime TURN o `ICE_SERVERS_JSON`). Sin TURN la voz suele fallar con datos móviles.
   - `src/lib/socket.ts`: fuerza reconexión al volver a primer plano / recuperar red.
4. **Sala / host** (`src/components/MapView.tsx`, `src/components/MainApp.tsx`, `firestore.rules`):
   - Cerrar la app, segundo plano, perder red o fallo de permiso GPS **ya no saca a nadie ni corta la ruta**
     (antes `pagehide`/`beforeunload` del host ponía `isRecording:false` para todos).
   - Al reabrir la app se **reengancha sola** a la ruta en marcha (`localStorage` `motoride_active_route_v1`).
   - Si el host **sale con el botón** y hay más gente rodando → **cede el mando** al compañero conectado más reciente.
     Si el host desaparece del grupo, el primer miembro reclama el mando automáticamente.
   - Compañeros sin conexión se quedan en el mapa atenuados («Sin conexión · reconectando») en vez de desaparecer.
   - `functions/src/index.ts` `purgeStaleOpenGroups`: rutas «grabando» > 36 h se consideran abandonadas y se borran.
5. **GPS** (`src/hooks/useLocationTracking.ts`): filtra fijos duplicados/desordenados, saltos imposibles (> ~300 km/h)
   e imprecisos; velocidad/rumbo `-1` de iOS tratados como «sin dato» (velocidad calculada por posiciones);
   rumbo ignorado parado; `maximumAge` 1 s; reinicia el `watchPosition` tras errores, al volver a primer plano y si
   pasa 20 s sin fijo.
6. **Medallas en pixel art** (`src/components/MedalGlyph.tsx`, reescrito): moneda pixelada + sprite temático
   (moto, casco, bandera, carretera, señal de curvas, velocímetro con aguja por nivel, tortuga, escudo, rayo,
   moto tumbada con ángulo, herradura, trofeos, diana, brújula, concha del Camino, engranaje, café, diamante,
   luna, corona, dado) + cinta con la cifra.
7. **Limpieza**: `.env` con `VITE_SOCKET_URL`; quitados `android/`, Capacitor, `server.js` antiguo, zips de gradle
   vacíos, `MotoRide APP.rar`, `Map.tsx` y `main.ts` sin uso, restos de AI Studio (`@google/genai`, Gemini,
   `metadata.json`, `firebase-blueprint.json`). Todo enviado a la **Papelera de reciclaje** (recuperable).
   `wrangler.jsonc`: nombre `motobike` + SPA fallback.

Verificado: `npx tsc --noEmit` y `npm run build` OK; pruebas locales del servidor (ice-servers, join/leave de voz,
`voice-peer-reset`) OK. Nada probado aún en móvil real.

## PENDIENTES (en orden)

1. **Desplegar reglas de Firestore** (necesarias para el traspaso de host; sin ellas la ruta sigue pero nadie
   recibe el mando hasta que alguien lo reclame, que también necesita las reglas):
   ```
   firebase deploy --only firestore:rules
   ```
2. **Desplegar Cloud Functions** (purga de rutas abandonadas): `cd functions; npm run build; cd ..; firebase deploy --only functions`
3. **Subir el servidor a Render** (`server.ts` cambió). `git` no está en el PATH de este PC: instalar Git for Windows
   o subir desde donde se despliegue Render. Render usa `PORT` de entorno (ya soportado).
4. **Activar TURN para la voz** (muy recomendable):
   Cloudflare dashboard → Realtime → TURN → crear clave → en Render poner `CLOUDFLARE_TURN_KEY_ID` y
   `CLOUDFLARE_TURN_KEY_API_TOKEN`. Comprobar: `https://motoride-socket.onrender.com/ice-servers` devuelve `iceServers` con `turn:`.
5. **Publicar la web**: `npm run build` y despliegue a Cloudflare (pipeline habitual o `npx wrangler deploy`).
   En el build de Cloudflare debe existir `VITE_SOCKET_URL` (el `.env` local está en `.gitignore`).
6. **Probar en iPhone**: inclinómetro (signo y curvas), voz entre 2–3 móviles con datos móviles, cerrar/abrir la app
   del host en mitad de ruta, mapa con Esri.
7. Opcional: `WhatsNewModal.tsx` → subir `WHATS_NEW_VERSION` y añadir entradas de estos cambios.
8. Opcional: dividir `MapView.tsx` (~220 KB) y `Dashboard.tsx` (~117 KB); code-splitting del bundle (1,6 MB).

## Comandos útiles

```
npm install
npm run dev            # servidor local (Express + Vite + Socket.IO) en http://localhost:3000
npm run build          # tsc + vite build → dist/
npx tsc --noEmit       # solo tipos
```
