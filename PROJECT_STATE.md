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
- Tarjeta (formato validado con maqueta a mano): tira 90×90 mm, un pliegue **horizontal** al medio. Panel de arriba = exterior ("Pista N:" + nombre del destinatario, centrado, nombre en negrita 23 pt, "Pista N:" 15 pt). Panel de abajo = interior (la pista, 15 pt, interlineado 18 pt, hasta 6 líneas), se dobla hacia atrás detrás del panel de arriba. Cerrada mide 90×45 mm. A4: 2×3 = 6 por hoja, márgenes laterales 15 mm. Límite de pista: **180 caracteres** (con 15 pt entran ~186 de texto normal), además de que debe entrar en 6 líneas (`checkClue`). Se bajó de 200 al agrandar la letra. Con 10 participantes: 6 hojas (2 por ronda). Letra grande a pedido (participantes de 57+): se subió +3 pt sobre la primera maqueta (12 → 15 pt). Si hace falta más grande, bajar el límite a ~140 o agrandar la tarjeta (queda 2 filas por hoja).
- Aviso "imprimí sin abrir" en la descarga (la admin no quiere leer pistas; manda a imprimir y que otra persona corte).

## Terminado
- Etapa 0: base del proyecto. Desplegada en Vercel + Supabase y verificada (la home mostró "Servidor y base de datos funcionando").
- Etapa 1 (código listo, falta imprimir la muestra y validar el plegado):
  - `api/_lib/cardsPdf.js`: `buildCardsPdf(rounds)` y `checkClue(text)` (validación para el backend: vacía, >200, caracteres no imprimibles, desborde). Helvetica estándar (cubre castellano), sin fontkit.
  - `api/_lib/random.js`: `shuffle` con `crypto.randomInt`.
  - `scripts/sample-pdf.js` (`npm run sample:pdf`) genera `muestra-tarjetas.pdf` con datos falsos.
  - Tests con `node:test` (`npm test`), sin dependencias extra (se quitó vitest y `@pdf-lib/fontkit`).
  - PDF determinista (mismas entradas → mismos bytes), sin autor/productor/fechas; título genérico "Tarjetas".
  - `checkName(name)`: valida nombres al cargarlos (imprimible, entra en la tarjeta, ≤40) para que el PDF final nunca falle por un nombre.
  - Nota conocida: con impresión de una sola cara, doblar el panel de la pista hacia atrás deja la pista visible en el dorso. Se probó un doblez en zigzag de 3 paneles (pista adentro, 4 por hoja) y se descartó por pedido; queda como alternativa si molesta.
- Etapa 2 (código listo, falta subir, correr `supabase/002_single_event.sql` y probar en producción):
  - Evento único (índice único en la base). Administradora = participante `is_admin`, creada junto con el evento.
  - Sesión de admin: token de 32 bytes, solo se guarda el hash; cookie `ai_admin` HttpOnly, Secure, SameSite=Strict, Path=/api, 90 días. Una sola sesión activa: recuperar acceso invalida la anterior.
  - Código de recuperación `XXXX-XXXX-XXXX-XXXX` (≈79 bits), se muestra una sola vez, guardado hasheado; se puede regenerar (el anterior deja de servir).
  - Endpoints: `GET/POST/DELETE /api/event`, `POST/PATCH/DELETE /api/participants`, `POST /api/recover`, `POST /api/recovery-code`, `GET /api/health`. Las modificaciones exigen `Content-Type: application/json` (anti-CSRF).
  - Reglas: participantes solo editables en `preparing`; máx. 40; nombres únicos sin importar mayúsculas/acentos; celular normalizado a dígitos con código de país (Argentina por defecto); la administradora no se puede quitar; borrar evento solo en `preparing`.
  - `api/_lib/store.js` (Supabase) y `memoryStore.js` (tests) comparten interfaz; los handlers reciben el store inyectado.
  - Frontend: `/` neutra, `/admin` (crear evento → código de recuperación → panel de participantes con alta/edición/baja, nuevo código y borrar evento).
  - 45 tests (`npm test`): permisos, validación, hashes en la base, cookies, recuperación. La capa de Supabase y el frontend NO se probaron automáticamente (sin red en la sesión de desarrollo).

## Pendiente
- Validar con impresión de la muestra nueva (90×90 mm): show-through del papel de 80 g, corte, plegado, legibilidad de 15 pt. Ajustar tamaño/límite si hace falta.
- Etapa 2: subir, correr `supabase/002_single_event.sql` (o recrear con `schema.sql`) y probar en producción.
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
Subir Etapa 2, correr `supabase/002_single_event.sql` y probar `/admin` en producción. En paralelo, imprimir `muestra-tarjetas.pdf` (A4, escala 100 %) y validar. Luego Etapa 3 (sorteo e invitaciones).
