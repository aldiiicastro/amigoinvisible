# 🎄 Amigo Invisible

Aplicación web para organizar juegos de **amigo invisible** entre familia o amigos, pensada para grupos chicos (hasta 40 personas por evento). Hace el sorteo en secreto, deja que cada persona escriba pistas anónimas sobre sí misma y arma un PDF listo para imprimir con las tarjetas de pistas.

Es un proyecto personal, sencillo de mantener y que corre en planes gratuitos.

## Qué resuelve

- **Sorteo realmente secreto.** Ni quien organiza puede ver quién le regala a quién (solo ve a quién le toca a ella, como todos).
- **Sin cuentas ni contraseñas.** Cada participante recibe un enlace privado por WhatsApp, de un solo uso.
- **Pistas anónimas.** Cada persona escribe 3 pistas sobre sí misma para quien le toca regalarle. Nadie, ni la organizadora, sabe quién escribió cuál.
- **Tarjetas imprimibles.** Un PDF en A4 con las pistas mezcladas, en letra grande para que se lean bien, para imprimir, cortar y doblar.
- **Varios eventos.** Una misma organizadora puede manejar, por ejemplo, "Navidad Familia" y "Navidad Amigos" por separado.

## Cómo se usa

**Quien organiza**
1. Crea el evento y carga a los participantes (nombre y WhatsApp). Guarda el código de recuperación.
2. Escribe las indicaciones para el grupo (fecha límite, monto máximo, etc.) y hace el sorteo.
3. Genera el enlace de cada persona y lo manda por WhatsApp con un botón (el mensaje sale armado).
4. Sigue el progreso ("X de N confirmaron sus pistas") y, cuando quiere, libera las pistas.
5. Descarga el PDF, lo manda a imprimir **sin abrirlo** y que otra persona corte y doble las tarjetas.

**Cada participante**
1. Abre su enlace y ve a quién le regala.
2. Escribe 3 pistas sobre sí misma o sí mismo (puede guardar borrador y seguir después) y las confirma.

A quien no llegó a confirmar se le completan las pistas con su borrador y, si falta, con frases genéricas ambiguas, para que nadie se quede sin pistas.

La guía paso a paso (instalación y uso el día del evento) está en **[DEPLOY.md](DEPLOY.md)**.

## Privacidad y seguridad

- El resultado del sorteo se guarda **cifrado** (AES-256-GCM) con una clave que solo existe en el servidor.
- El sorteo usa aleatoriedad criptográfica y es uniforme (nadie se toca a sí mismo).
- Los enlaces y las sesiones se guardan solo como **hash**; un enlace nuevo invalida el anterior.
- Las pistas confirmadas van a un pozo que **no guarda autor ni fechas**, y se mezclan al liberarlas.
- La base de datos no es accesible desde el navegador: todo pasa por funciones del servidor.
- Hay pruebas automáticas de anonimato y permisos (`npm test`).

Limitaciones conocidas: la organizadora puede deducir quién confirmó si alguien le avisa justo cuando sube el contador; y quien tiene acceso a la clave de cifrado y a la base de datos podría reconstruir el sorteo (es el administrador del sistema).

## Tecnología

React + Vite + Mantine (JavaScript, sin TypeScript) · Vercel Functions (Node.js) · Supabase (PostgreSQL) · pdf-lib · despliegue en Vercel desde GitHub.

```
api/            funciones de Vercel (un archivo por endpoint) y api/_lib con la lógica y los tests
src/            frontend (páginas y componentes)
supabase/       esquema SQL completo (schema.sql) y migraciones numeradas
scripts/        utilidades (PDF de muestra)
PROJECT_STATE.md  decisiones técnicas, estado y pendientes
DEPLOY.md       instalación y guía de uso
```

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar las variables
npx vercel dev               # frontend + API (npm run dev solo corre el frontend)
npm test                     # pruebas automáticas
npm run sample:pdf           # genera un PDF de muestra para probar la impresión
```

Variables de entorno (solo servidor): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATA_ENCRYPTION_KEY` (ver `.env.example`).
