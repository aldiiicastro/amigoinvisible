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
- Etapa 2 (desplegada y probada en producción):
  - Evento único (índice único en la base). Administradora = participante `is_admin`, creada junto con el evento.
  - Sesión de admin: token de 32 bytes, solo se guarda el hash; cookie `ai_admin` HttpOnly, Secure, SameSite=Strict, Path=/api, 90 días. Una sola sesión activa: recuperar acceso invalida la anterior.
  - Código de recuperación `XXXX-XXXX-XXXX-XXXX` (≈79 bits), se muestra una sola vez, guardado hasheado; se puede regenerar (el anterior deja de servir).
  - Endpoints: `GET/POST/DELETE /api/event`, `POST/PATCH/DELETE /api/participants`, `POST /api/recover`, `POST /api/recovery-code`, `GET /api/health`. Las modificaciones exigen `Content-Type: application/json` (anti-CSRF).
  - Reglas: participantes solo editables en `preparing`; máx. 40; nombres únicos sin importar mayúsculas/acentos; celular normalizado a dígitos con código de país (Argentina por defecto); la administradora no se puede quitar; borrar evento solo en `preparing`.
  - `api/_lib/store.js` (Supabase) y `memoryStore.js` (tests) comparten interfaz; los handlers reciben el store inyectado.
  - Frontend: `/` neutra, `/admin` (crear evento → código de recuperación → panel de participantes con alta/edición/baja, nuevo código y borrar evento).
  - 45 tests (`npm test`): permisos, validación, hashes en la base, cookies, recuperación. La capa de Supabase y el frontend NO se probaron automáticamente (sin red en la sesión de desarrollo).

- Etapa 3 (desplegada y probada en producción):
  - Sorteo: `POST /api/draw`. Derangement uniforme por rechazo con `crypto.randomInt` (`api/_lib/draw.js`, admite `isAllowed` para exclusiones futuras), mínimo 3. Se guarda con la función SQL `perform_draw` (una transacción que bloquea el evento y pasa `preparing → drawn`), por lo que no se puede sortear dos veces. La respuesta no trae el resultado.
  - Cifrado: `api/_lib/cipher.js`, AES-256-GCM con clave `DATA_ENCRYPTION_KEY`; el destinatario se cifra atado al id de quien regala (AAD). **No perder ni cambiar la clave después de sortear.**
  - Invitaciones: `POST /api/invites` (admin, solo en `drawn`) devuelve un token que se ve una sola vez; en la base solo el hash. Generar uno nuevo invalida el anterior y cierra la sesión de ese participante. El panel muestra por persona: sin enlace / enlace generado / ya entró.
  - Canje: `/entrar/:token` + botón "Entrar" → `POST /api/enter` (un POST para que las vistas previas de WhatsApp no gasten el enlace). Canje atómico (un solo UPDATE): borra el hash del enlace y guarda el hash de la sesión; cookie `ai_part` (HttpOnly, Secure, SameSite=Strict, Path=/api, 90 días). Si la organizadora abre un enlace ajeno, la persona ve "enlace ya usado".
  - `GET /api/me`: cada persona ve solo su nombre y el nombre de su amigo invisible. La organizadora entra con su cookie de administración como una participante más (sin enlace). Vista en `/mi-amigo`.
  - Reglas tras el sorteo: no se suma ni quita gente; sí se corrigen nombre y celular (afecta solo lo que se muestra). Borrar el evento sorteado exige `?confirm=BORRAR` (en la UI, escribir BORRAR); destruye el resultado y las sesiones.
  - Botón "Enviar por WhatsApp": enlace `wa.me/<celular>?text=...` con mensaje prearmado, tras generar el enlace (dos pasos para que el navegador no bloquee la ventana).
  - Funciones Vercel: 9 de 12 permitidas en el plan Hobby (`draw, enter, event, health, invites, me, participants, recover, recovery-code`). Etapas 4 y 5 agregan ~2: considerar unir endpoints si hace falta.
  - 76 tests (`npm test`): derangement (reglas y uniformidad), cifrado, canje único, permisos, privacidad de `/api/me`. Supabase y el frontend siguen sin pruebas automáticas.

- Ajustes post-Etapa 3 (requieren correr `supabase/004_description.sql`):
  - Indicaciones: `events.description` (≤600 caracteres), `PATCH /api/event`. Se agregan al final del mensaje de WhatsApp y se muestran en `/mi-amigo`. Mensaje: `Hola <nombre>, te paso el enlace para tu amigo invisible "<evento>":\n<enlace>\n\n<indicaciones>` (sin emoji).
  - Reingreso: `GET /api/me?scope=participant` ignora la sesión de admin. `/entrar/:token` consulta eso al cargar: si ya hay sesión de participante en ese teléfono, redirige a `/mi-amigo` sin gastar el enlace. Desde otro dispositivo se necesita un enlace nuevo (lo genera la organizadora).
  - Error de enlace usado más claro. 85 tests.

- Etapa 4 (requiere correr `supabase/005_clues.sql`):
  - Cada persona escribe 3 pistas sobre sí misma para quien le toca regalar (pista N → ronda N del destinatario). `GET/PUT/POST /api/clues` (función 10 de 12 en Hobby). La organizadora escribe las suyas igual, con su cookie de admin.
  - Borrador: tabla `drafts`, 3 columnas cifradas (AES-GCM, AAD `draft:<participante>:<n>`), sin timestamps. Se guarda con PUT (puede estar incompleto).
  - Confirmar: función SQL `confirm_clues` (transacción: bloquea evento y participante, inserta 3 filas en `clue_pool`, marca `participants.confirmed`, borra el borrador). `clue_pool` NO guarda autor ni fechas; texto cifrado con AAD `pool:<destinatario>:<ronda>`; índice único (destinatario, ronda). Tras confirmar no se puede ver ni cambiar.
  - Progreso para la organizadora: `GET /api/event` devuelve `clues: {confirmed, total}` (solo totales; nunca por persona). Limitación aceptada: si ve el contador subir mientras alguien le avisa que confirmó, puede inferirlo.
  - Pendiente de diseño para Etapa 5: orden del pool (`position`) se fija al liberar, mezclado con `crypto.randomInt`.
  - 91 tests.

- Etapa 5 (requiere correr `supabase/006_release.sql`):
  - Liberación manual (sin fecha límite automática: no hay procesos persistentes en Vercel; la organizadora decide cuándo). `POST /api/cards` (admin, solo en `drawn`): a quien no confirmó se le arma con su borrador y, si falta, pistas genéricas (`api/_lib/genericClues.js`, 24 frases ambiguas, mazo mezclado sin repetir). Función SQL `release_event` (transacción: inserta rellenos con `on conflict do nothing`, marca todos confirmados, borra borradores, `drawn → released`).
  - Orden de impresión: `ensurePositions` mezcla cada ronda con `crypto.randomInt` y guarda `clue_pool.position` vía `set_pool_positions`; es perezoso e idempotente (si falla tras liberar, el siguiente GET lo completa). El PDF sale siempre igual.
  - Descarga: `GET /api/cards` (solo admin, solo `released`), `Content-Disposition: attachment; filename="tarjetas.pdf"`. El panel avisa "Imprimilo sin abrirlo" y arma 3 rondas × ceil(N/6) páginas. Se puede descargar las veces que haga falta.
  - `createHandler` ahora soporta `{file: {data, contentType, filename}}`. Función 11 de 12 en Hobby (queda 1 libre).
  - Borrar el evento liberado exige `?confirm=BORRAR` (en la UI, escribir BORRAR). `closed` queda sin usar.
  - 97 tests.

## Pendiente
- Ajustes post-Etapa 3: correr `supabase/004_description.sql` en Supabase y recién después subir/desplegar.
- Validar con impresión de la muestra nueva (90×90 mm): show-through del papel de 80 g, corte, plegado, legibilidad de 15 pt. Ajustar tamaño/límite si hace falta.
- Etapa 6: pruebas de anonimato/permisos y guía de despliegue.

## Despliegue (resumen)
1. Supabase: crear proyecto y ejecutar `supabase/schema.sql` en el SQL Editor.
2. Vercel: importar el repo de GitHub; cargar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
3. Desarrollo local completo: `npm install` y `npx vercel dev` (carga `/api` junto con Vite). Con `npm run dev` solo corre el frontend.
4. Supabase Free se pausa tras 7 días sin actividad: entrar antes del evento.

## Próximo paso
Probar Etapa 5 en producción (liberar, descargar, imprimir). Después, Etapa 6: pruebas de anonimato/permisos y guía de despliegue. Pendiente en paralelo: imprimir `muestra-tarjetas.pdf` y validar el plegado.
