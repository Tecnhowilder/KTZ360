📋 AUDITORÍA DE BRANDING — BRIVIA APP (Actualmente: KTZ360)
===========================================================================

ESTADO ACTUAL DE LA APP
-----------------------
Nombre: KTZ360
Slogan: "Cotiza · Planifica · Construye"
URL: https://ktz360.app
Color primario: #2563EB (Azul)
Color secundario/Accent: #06B6D4 (Cian)


1️⃣  ARCHIVOS DE BRANDING EN /public/icons/
==================================================
✓ Logos:
  - logo-light.png      (Usado en pantalla de auth y header móvil)
  - logo-dark.png       (Usado en sidebar desktop)
  - logo-icon.png       (Usado en sidebar collapsed y mask-icon)
  - KTZ360_Primary.png  (Archivo principal de marca)

✓ Favicon y PWA:
  - favicon.ico         (Favicon clásico)
  - favicon-16.png      (16x16)
  - favicon-32.png      (32x32)
  - favicon-48.png      (48x48)
  - favicon-64.png      (64x64)
  - apple-touch-icon.png (180x180, iOS)
  - maskable-icon.png   (512x512, icon adaptativo)

✓ App Icons:
  - icon-192.png        (PWA Android)
  - icon-512.png        (PWA Android)
  - mstile-150x150.png  (Windows)

✓ OG y Social:
  - og-cover.png        (Open Graph para redes)

✓ Splash:
  - splash-1080x1920.png
  - splash-1179x2556.png
  - splash-1290x2796.png
  - splash-2048x2732.png


2️⃣  REFERENCIAS EN CÓDIGO
============================

📄 Archivos principales:
  ✓ src/lib/brand.ts
    - Define: APP_NAME, APP_SLOGAN, APP_URL, COMPANY_NAME
    - Colores: BRAND_COLORS (primary, accent, white, dark)
    
  ✓ index.html (HEAD)
    - <title>KTZ360 — Cotiza · Planifica · Construye</title>
    - meta name="theme-color" content="#2563EB"
    - meta name="application-name" content="KTZ360"
    - meta property="og:title" content="KTZ360"
    - Link a favicon-32.png, favicon-16.png, favicon.ico
    - Link a apple-touch-icon.png
    - Link a manifest.json

  ✓ public/manifest.json
    - name: "KTZ360"
    - short_name: "KTZ360"
    - description: "Cotiza, planifica y construye."
    - theme_color: "#2563EB"
    - background_color: "#FFFFFF"
    - Icons: icon-192.png, icon-512.png, maskable-icon.png

  ✓ package.json
    - name: "ktz360-app"

🎨 Componentes que usan logo:
  ✓ src/features/auth/AuthLayout.tsx
    - <img src="/icons/logo-light.png" alt="KTZ360" />
    
  ✓ src/components/layout/Sidebar.tsx
    - <img src="/icons/logo-dark.png" alt="KTZ360" /> (expandido)
    - <img src="/icons/logo-icon.png" alt="KTZ360" /> (collapsed)
    
  ✓ src/components/layout/MobileHeader.tsx
    - <img src="/icons/logo-light.png" alt="KTZ360" />

💬 Textos que mencionan "KTZ360":
  ✓ src/components/dashboard/MobileDashboard.tsx (2 referencias a "KTZ360 IA")
  ✓ src/components/catalog/ImportCatalogModal.tsx (nombre archivo Excel)
  ✓ Comentarios en CSS (src/styles/*.css)
  ✓ Nombres de vistas


3️⃣  COLORES EN USO
====================
Primario:     #2563EB (Azul profesional)
Secundario:   #06B6D4 (Cian/Turquesa)
Dark:         #0F172A (Navy muy oscuro)
Neutral bg:   #F8FAFC (Gris muy claro)
Blanco:       #FFFFFF

NOTA: El nuevo logo (Shelwi) usa:
- Azul cielo (aprox. #0088CC o similar)
- Naranja/Dorado (#FFA500 o similar)
- Fondo negro profundo
→ Estos colores NO coinciden con la paleta actual


4️⃣  IMPACTO DE CAMBIO DE MARCA
================================

CAMBIOS NECESARIOS (OBLIGATORIOS):
✓ Cambiar 21+ archivos de icono/logo en /public/icons/
✓ Actualizar src/lib/brand.ts (APP_NAME, APP_SLOGAN, colores)
✓ Actualizar index.html (title, meta descriptions, OG)
✓ Actualizar public/manifest.json (name, description)
✓ Actualizar package.json (name)
✓ Cambiar color scheme en todas las referencias (#2563EB → nuevo color)

CAMBIOS CÓDIGO (REFERENCIAS):
~ src/features/auth/AuthLayout.tsx (alt text)
~ src/components/layout/Sidebar.tsx (alt text)
~ src/components/layout/MobileHeader.tsx (alt text)
~ src/components/dashboard/MobileDashboard.tsx (textos "KTZ360 IA")
~ src/components/catalog/ImportCatalogModal.tsx (nombre template)
~ Comentarios CSS

CAMBIOS EN ESTILOS:
~ Posibles ajustes de tamaño si nuevo logo tiene proporciones diferentes
~ Posibles ajustes de color de tema si usa paleta diferente


5️⃣  ARCHIVOS A GENERAR/REEMPLAZAR
====================================

OBLIGATORIO (Si no existen, la app no funcionará correctamente):

Para FAVICON:
  □ favicon.ico (32x32 o 64x64, formato ICO con fondo negro)
  □ favicon-16.png (16x16, PNG, fondo negro)
  □ favicon-32.png (32x32, PNG, fondo negro)
  □ favicon-48.png (48x48, PNG, fondo negro)
  □ favicon-64.png (64x64, PNG, fondo negro)

Para PWA Android:
  □ icon-192.png (192x192, PNG, fondo negro)
  □ icon-512.png (512x512, PNG, fondo negro)
  □ maskable-icon.png (512x512, PNG, apto para bordes recortados, fondo negro)

Para iOS:
  □ apple-touch-icon.png (180x180, PNG, fondo negro)

Para Windows:
  □ mstile-150x150.png (150x150, PNG, fondo negro)

Para SOCIAL/OG:
  □ og-cover.png (1200x630 recomendado, PNG, con logo Shelwi en fondo negro)

Para LOGOS EN COMPONENTES:
  □ logo-light.png (usado en auth/header móvil, PNG con fondo transparente)
  □ logo-dark.png (usado en sidebar, PNG con fondo transparente)
  □ logo-icon.png (ícono solo, PNG con fondo transparente)
  □ KTZ360_Primary.png → RENOMBRAR o reemplazar

Para SPLASH SCREEN (PWA/iOS):
  □ splash-1080x1920.png
  □ splash-1179x2556.png
  □ splash-1290x2796.png
  □ splash-2048x2732.png


6️⃣  VALIDACIÓN DE CALIDAD REQUERIDA
======================================

✅ REQUISITOS PARA ACEPTAR NUEVA MARCA:

1. DIMENSIONES: Los archivos DEBEN tener exactamente los tamaños especificados
   - favicon: 16x16, 32x32, 48x48, 64x64 pixeles
   - icons PWA: 192x192, 512x512 pixeles
   - apple-touch: 180x180 pixeles
   - mstile: 150x150 pixeles
   - og-cover: 1200x630 pixeles (mínimo)

2. FORMATO:
   - PNG: Logo light, dark, icon, icons PWA, apple, mstile, og, splash
   - ICO: favicon.ico (puede ser multi-resolución)

3. FONDO:
   - ✓ Negro profundo (#000000 o similar) como se muestra en imagen adjunta
   - ✓ Transparente SOLO para logos en componentes (logo-light, logo-dark, logo-icon)

4. ESTILO:
   - ✓ Debe ser visualmente idéntico al logo "Shelwi" que compartiste
   - ✓ Si hay mínimas diferencias en proporciones o estilos, será rechazado
   - ✓ Colores DEBEN mantener consistencia (azul + naranja/oro)

5. COMPATIBILIDAD:
   - ✓ PNG debe ser compatible con navegadores (no formatos nuevos)
   - ✓ Los favicons deben verse bien a tamaños pequeños (16px)


7️⃣  RESUMEN DE CAMBIOS POSIBLES
==================================

✅ SÍ SE PUEDE HACER:
  • Reemplazar 21+ archivos de icono/logo
  • Cambiar nombre de app (KTZ360 → Shelwi o lo que sea)
  • Cambiar slogan
  • Actualizar colores de marca si lo deseas
  • Actualizar manifest, meta tags, title

⚠️  CONDICIONES:
  • Necesitas archivos PNG/ICO con dimensiones exactas
  • Deben ser idénticos en estilo (tu imagen de referencia)
  • Fondo NEGRO PROFUNDO como especificaste
  • Si las proporciones varían mucho, habrá que ajustar CSS

❌ NO SE PUEDE HACER (SIN GENERAR NUEVAS IMÁGENES):
  • Usar imágenes actuales de KTZ360 (no existen en otro estilo)
  • Cambiar sin tener los archivos correctos


8️⃣  PRÓXIMOS PASOS (ESPERAR CONFIRMACIÓN)
==========================================

1. ¿Tienes ya los archivos PNG/ICO con el logo Shelwi en formato correcto?
   → Si NO: ¿Necesitas que genere las imágenes? (requiere herramienta de diseño)
   → Si SÍ: ¿Los tienes en los tamaños exactos listados arriba?

2. ¿Cuál será el NUEVO nombre de la app?
   → Reemplazará "KTZ360" en todos lados

3. ¿Nuevo slogan?
   → Reemplazará "Cotiza · Planifica · Construye"

4. ¿Nuevos COLORES de marca?
   → O mantenemos los actuales pero con nuevo logo?


═══════════════════════════════════════════════════════════════════════════════

IMPORTANTE: Este documento es solo para AUDITORÍA Y PLANIFICACIÓN.
NO se ha modificado nada en la app hasta que confirmes explícitamente.

Espera confirmación del usuario antes de proceder con cambios.
