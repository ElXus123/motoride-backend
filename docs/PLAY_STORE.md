# Publicar MotoRide en Google Play (PWA → Android)

**Estado (2026-04): en pausa** — la cuenta de desarrollador de Google Play tiene un coste de registro (unos 25 €; revisar precio actual). Cuando haya presupuesto, retoma a partir de la sección 0.

---

MotoRide es una **PWA** (web). En Play Store se publica como **Trusted Web Activity (TWA)**: un contenedor Android muy fino que abre tu URL en pantalla completa, como una app nativa.

## 0. Lo que ya está preparado en el repo

- `public/manifest.webmanifest` afinado (idioma, categorías, `standalone` recomendado para TWA).
- `public/icon-192.png` y `public/icon-512.png` (regenerar con `npm run pwa:icons` si cambias `ICONO.png`).
- Script `npm run pwa:icons` usando `sharp`.
- Esta guía y la plantilla `docs/assetlinks.json.template`.

**Necesitas obligatoriamente:**

1. Un dominio **HTTPS** donde la app esté **desplegada y estable** (la misma URL que usará el TWA), por ejemplo tu Workers/Pages actual.
2. Cuenta de **desarrollador de Google Play** (pago único, revisa precio actual en [Google Play Console](https://play.google.com/console)).
3. Una **política de privacidad** publicada en una URL pública (obligatoria si recoges datos: Firebase, ubicación, micrófono, etc.).
4. PC con **Node.js**, **JDK 17+** y **Android SDK** (Android Studio) para generar el **AAB** con Bubblewrap.

---

## 1. Despliegue y comprobaciones web

1. Haz `npm run build` y despliega `dist` (o tu pipeline habitual) a tu **URL final de producción**.
2. Abre en el móvil: `https://TU-DOMINIO/manifest.webmanifest` → debe responder 200 JSON.
3. Abre `https://TU-DOMINIO/.well-known/assetlinks.json` **después** del paso 4 (por ahora puede 404).

---

## 2. Crear el proyecto Android con Bubblewrap (TWA)

En una carpeta **fuera** del repo o en una carpeta `android-twa/` (puedes ignorarla en git si quieres):

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest=https://TU-DOMINIO/manifest.webmanifest
```

Durante el asistente te pedirá, entre otras cosas:

- **Package name** (único, no lo cambies después sin complicaciones), p. ej. `dev.motoride.app` o `com.tuusuario.motoride`.
- **Hostname** y **start URL** (suelen salir del manifest).
- **Android keystore**: elige **crear uno nuevo** y **guarda en lugar seguro** la contraseña y el archivo `.jks` (sin esto no podrás actualizar la app en Play).

Luego:

```bash
cd <carpeta-del-proyecto-generado>
bubblewrap build
```

Esto genera un **`.aab`** (Android App Bundle) listo para subir a Play Console.

**Firma:** la primera vez Play puede ofrecerte “Play App Signing”; suele ser recomendable aceptar el firmado gestionado por Google conservando tu clave de subida.

---

## 3. Digital Asset Links (imprescindible para TWA)

Android debe verificar que **tú controlas el dominio** que abre la PWA.

1. Tras el primer `bubblewrap build` (o `keytool`), obtén la **huella SHA-256** del certificado de **firma de la app** (Bubblewrap / documentación oficial lo explican; también aparece en Play Console una vez subido el primer AAB).
2. Crea el archivo **`/.well-known/assetlinks.json`** en tu servidor (mismo host que la PWA), con el formato de la plantilla:

   - Copia `docs/assetlinks.json.template`
   - Sustituye `TU_PAQUETE_ANDROID` y `HUELLA_SHA256` por tus valores reales.

3. Debe servirse con **Content-Type: application/json** y **HTTPS**.
4. Comprueba: [Statement List Generator and Tester](https://developers.google.com/digital-asset-links/tools/generator) (herramienta de Google).

Sin esto, el TWA puede abrirse como pestaña con barra de URL en lugar de experiencia “app”.

---

## 4. Google Play Console — paso a paso (resumen)

1. Entra en [Play Console](https://play.google.com/console) → **Crear aplicación**.
2. Rellena **nombre**, **idioma predeterminado**, tipo (app), acepta programas/políticas.
3. **Panel de la app** → ve completando las secciones obligatorias:

   - **Ficha de Play Store:** descripción corta/larga, capturas de pantalla (móvil obligatorio; tablet opcional), icono 512×512 (puedes usar `public/icon-512.png`), gráfico de funciones 1024×500.
   - **Clasificación de contenido** (cuestionario).
   - **Público objetivo** y cumplimiento (incl. si es para menores).
   - **Política de privacidad** → URL pública.
   - **Seguridad de los datos** (Data safety): declara ubicación aproximada, micrófono, cuenta, etc., según lo que hace MotoRide (Firebase, Socket, voz, GPS).
   - **Acceso a apps** (si hay login, explica cómo probar la app).

4. **Producción** (o prueba interna/cerrada primero) → **Crear versión** → sube el **`.aab`** generado por Bubblewrap.
5. Revisa advertencias, envía a revisión.

Los tiempos de revisión suelen ser de **horas a varios días**.

---

## 5. Actualizaciones futuras

- Cambios **solo en la web**: despliegas el front; muchos usuarios ven la actualización al abrir la app (sin subir AAB nuevo), salvo que cambies `start_url`, `scope` o requisitos del TWA.
- Cambios en **configuración Android** (package, permisos extra, versión): vuelve a `bubblewrap build` y sube un **nuevo AAB** con `versionCode` incrementado (Bubblewrap lo gestiona en el proyecto Android).

---

## 6. Checklist rápido

- [ ] Producción HTTPS estable y manifest accesible  
- [ ] `npm run pwa:icons` tras cambiar logo  
- [ ] `assetlinks.json` en `/.well-known/`  
- [ ] Política de privacidad en URL pública  
- [ ] Data safety y clasificación rellenados con sinceridad  
- [ ] AAB firmado y backup del keystore  

Si quieres, en un siguiente mensaje indica tu **dominio de producción** y el **package name** que vayas a usar y te devuelvo el `assetlinks.json` ya rellenado (faltará solo pegar la huella SHA-256 cuando la tengas).
