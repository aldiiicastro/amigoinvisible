# PROJECT_STATE

## Arquitectura
React + Vite + Mantine (JS) → `/api/*` (Vercel Functions) → Supabase Postgres.
El navegador nunca habla con Supabase. RLS activado sin políticas. Service role solo en el servidor.

## Decisiones tomadas
- Sin TypeScript. Un solo repo (`/src` + `/api`).
- Enlace de invitación de un solo canje (POST) → cookie httpOnly. Tokens de 32 bytes, guardados hasheados. La admin puede reemitir.
- Asignaciones, borradores y pistas cifrados (AES-GCM, clave en env de Vercel).
- Pistas confirmadas van a `clue_pool` sin autor ni timestamps; los borradores se borran al confirmar.
- Sorteo: derangement por rechazo con `crypto.randomInt`, mínimo 3 participantes; transición atómica `preparing → drawn`.
- Liberación perezosa (sin cron): `now >= release_at` o todos confirmados.
- Al liberar, quien no confirmó usa sus borradores y se completa con pistas genéricas de un pool fijo (~20). Se marcan igual que las demás.
- Contador de progreso con retraso de unas horas, sin nombres.
- Tarjeta (formato validado con maqueta a mano): tira 90×90 mm, un pliegue **horizontal** al medio. Panel de arriba = exterior ("Pista N:" + nombre del destinatario, centrado, nombre en negrita 20 pt). Panel de abajo = interior (la pista, 12 pt, interlineado 14,4 pt, hasta 7 líneas), se dobla hacia atrás detrás del panel de arriba. Cerrada mide 90×45 mm. A4: 2×3 = 6 por hoja, márgenes laterales 15 mm. Límite de pista: **200 caracteres**, además de que debe entrar en 7 líneas (`checkClue`). Con 10 participantes: 6 hojas (2 por ronda). Letra grande a pedido, para lectores mayores.
- Aviso "imprimí sin abrir" en la descarga (la admin no quiere leer pistas; manda a imprimir y que otra persona corte).

## Terminado
- Etapa 0: base del proyecto (código completo; falta subir `src/`, `index.html`, `vercel.json`, `supabase/`, `api/health.js` al repo y desplegar en Supabase + Vercel).
- Etapa 1 (código listo, falta imprimir la muestra y validar el plegado):
  - `api/_lib/cardsPdf.js`: `buildCardsPdf(rounds)` y `checkClue(text)` (validación para el backend: vacía, >200, caracteres no imprimibles, desborde). Helvetica estándar (cubre castellano), sin fontkit.
  - `api/_lib/random.js`: `shuffle` con `crypto.randomInt`.
  - `scripts/sample-pdf.js` (`npm run sample:pdf`) genera `muestra-tarjetas.pdf` con datos falsos.
  - Tests con `node:test` (`npm test`), sin dependencias extra (se quitó vitest y `@pdf-lib/fontkit`).
  - PDF determinista (mismas entradas → mismos bytes), sin autor/productor/fechas; título genérico "Tarjetas".

## Pendiente
- Validar con impresión de la muestra nueva (90×90 mm): show-through del papel de 80 g, corte, plegado, legibilidad de 12 pt. Ajustar tamaño/límite si hace falta.
- Desplegar Etapa 0 (Supabase + Vercel) con guía paso a paso.
- Etapa 2: evento y participantes.
- Etapa 3: sorteo e invitaciones.
- Etapa 4: pistas, pool anónimo, progreso.
- Etapa 5: liberación y descarga final.
- Etapa 6: pruebas de anonimato/permisos y guía de despliegue.

## Despliegue (resumen)
1. Supabase: crear proyecto y ejecutar `supabase/schema.sql` en el SQL Editor.
2. Vercel: importar el repo de GitHub; cargar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
3. Desarrollo local completo: `npm install` y `npx vercel dev` (carga `/api` junto con Vite). Con `npm run dev` solo corre el frontend.
4. Supabase Free se pausa tras 7 días sin actividad: entrar antes del evento.

## Próximo paso
Desplegar Etapa 0, imprimir `muestra-tarjetas.pdf` (A4, escala 100 %, sin "ajustar a página") y validar el plegado. Luego Etapa 2.
