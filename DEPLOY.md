# Guía: instalar y usar Amigo Invisible

## 1. Instalación (una sola vez)

1. **Supabase** (supabase.com): crear un proyecto. En *SQL Editor > New query* pegar **todo** `supabase/schema.sql` y ejecutar.
   En *Project Settings > API* copiar la URL del proyecto y la clave `service_role` (secreta).
2. **Clave de cifrado**: abrir el navegador, F12 > Consola, pegar y apretar Enter:
   `btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))`
   Copiar el resultado (44 caracteres). **Guardarlo en un gestor de contraseñas: si se pierde o se cambia después del sorteo, se pierde quién le regala a quién.**
3. **Vercel** (vercel.com): *Add New > Project*, importar el repositorio de GitHub. Antes de desplegar, en *Environment Variables* cargar:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DATA_ENCRYPTION_KEY`
   Framework: Vite (lo detecta solo). Desplegar. Cada `git push` a `main` se despliega solo.
4. Probar `https://TU-DOMINIO/api/health`: debe responder `{"ok":true}`.

Si ya tenías una versión anterior instalada, no vuelvas a correr `schema.sql`: ejecutá solo las migraciones nuevas (`supabase/00X_*.sql`) en orden.

## 2. Cómo se juega (en orden)

1. Entrá a `/admin`, creá el evento y **guardá el código de recuperación** (se muestra una sola vez, es uno solo para todos tus eventos; no lo mandes por WhatsApp ni lo dejes como borrador en un chat).
   Para otro grupo (por ejemplo Familia y Amigos) usá **Crear otro evento** en `/admin`: cada evento tiene sus propios participantes, sorteo y pistas.
2. Cargá a todos (nombre y WhatsApp). Mínimo 3. Después del sorteo no se suma ni se quita gente.
3. Escribí las indicaciones (fecha límite, monto) y tocá **Hacer el sorteo**. Es definitivo.
4. Para cada persona: **Generar enlace > Enviar por WhatsApp**. Cada enlace sirve una sola vez: **no abras los de los demás**. Si alguien cambia de teléfono o lo pierde, generale un enlace nuevo (el anterior deja de funcionar).
5. Cada persona entra, ve a quién le regala y escribe sus 3 pistas (borrador y después **Confirmar**). Vos ves solo "X de N confirmaron".
6. Cuando quieras (idealmente con todos confirmados): **Liberar pistas**. A quien falte se le completa con su borrador o con pistas genéricas. No se puede deshacer.
7. **Descargar tarjetas (PDF)** y mandarlo a imprimir **sin abrirlo**: A4, tamaño real (100%), una cara. Que otra persona corte por las líneas punteadas y doble por la línea clara del medio, con las pistas hacia adentro.

## 3. Cosas para tener en cuenta

- **Supabase gratis se pausa tras 7 días sin actividad.** Entrá a `/api/health` o al panel unos días antes del evento; si estaba pausado, reactivalo desde supabase.com.
- Si perdés el acceso de administradora: `/admin` > "Soy quien organiza el juego" > código de recuperación. Si lo perdiste también, el evento no se puede administrar (habría que borrarlo desde Supabase y empezar de cero).
- Después de usar el código de recuperación para entrar, generá uno nuevo desde el panel si sospechás que alguien lo vio.
- Tu propia pantalla de juego está en `/mi-amigo` (si jugás en varios eventos, te deja elegir cuál). Si una persona juega en dos eventos, recibe un enlace por cada uno y los dos quedan en su teléfono.
- Para borrar todo y empezar de nuevo: **Borrar el evento** (escribir BORRAR). Es el modo de limpiar el evento de prueba.
- Desarrollo local: `npm install`, copiar `.env.example` a `.env.local` y completarlo, `npx vercel dev` (con `npm run dev` solo corre el frontend). Tests: `npm test`.
