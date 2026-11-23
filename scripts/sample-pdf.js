// Genera un PDF de muestra con datos falsos para probar impresión, corte y plegado.
// Uso: npm run sample:pdf [archivo-salida]
import { writeFile } from 'node:fs/promises';
import { buildCardsPdf, checkClue } from '../api/_lib/cardsPdf.js';
import { shuffle } from '../api/_lib/random.js';

const names = [
  'Ana', 'Bruno', 'Carla', 'Diego', 'Elena',
  'Facundo', 'Gabriela', 'Hernán', 'Inés', 'María de los Ángeles',
];

// Mezcla de largos: cortas, medias y varias cerca del límite (peor caso de ocupación).
const clues = [
  [
    'No soy la persona que está leyendo esto.',
    'Me encanta cocinar para otros, siempre llego tarde a los cumpleaños y tengo una colección de tazas que nadie entiende. Mi risa se escucha desde la cuadra.',
    'Nos conocemos desde hace bastante.',
    'Siempre pido el último pedazo de pizza y después digo que no tenía hambre.',
    'Una vez me quedé dormido en un casamiento. Sentado, con la copa en la mano.',
    'Soy de los que dicen "ya salgo" y todavía están en pijama.',
    'Mi nombre no empieza con la letra que estás pensando.',
    'Tengo opinión sobre todos los equipos de fútbol, aunque jamás miro un partido completo.',
    'Hoy estoy más cerca de lo que creés.',
    'Sé guardar secretos, pero no siempre.',
  ],
  [
    '¿Quién se lleva el último mate? Yo, con mucha dignidad.',
    'Cuando llueve me da por ordenar cajones, y después no encuentro nada durante semanas. Cuando por fin aparece lo que buscaba, ya no me hace falta y lo guardo en otro cajón.',
    'Alguna vez me viste con cara de no haber dormido.',
    'Canto en la ducha y creo que lo hago muy bien, aunque nadie confirmó nunca esa teoría.',
    'Mis zapatillas favoritas tienen más años que algunos sobrinos.',
    'Corto los carteles de "no pasar" con una creatividad envidiable.',
    'Hice un curso de algo y nunca más lo volví a mencionar.',
    'Si hay torta, ya sé dónde está. Si no hay, también.',
    'Mi mayor talento es el de encontrar enchufes en cualquier lugar. Mi mayor defecto, olvidarme el cargador en casa.',
    'Tengo un apodo que en realidad nunca nadie usa pero a mí me gusta.',
  ],
  [
    'Llevo años intentando aprender a andar en bicicleta sin manos.',
    'La última vez que me reí sin parar fue hace tres días, y no pienso decir por qué.',
    'Me acuerdo del cumpleaños de todos menos del mío. Es un talento nada práctico.',
    'Mi comida favorita cambia según con quién esté. Hoy, la de la abuela.',
    'Tengo la costumbre de llegar justo cuando termina la parte más interesante.',
    'Cuando cuento un chiste me río antes que el resto. Lo sé, es una mala estrategia.',
    'Mis amigos me dicen que soy "muy tranquilo" y yo solo estoy pensando en la cena.',
    'Esta pista tiene el largo máximo para probar el peor caso: palabras con acentos, eñes, ¿preguntas? y ¡exclamaciones! hasta llegar al límite permitido por cada tarjeta.',
    'Pregunto "¿falta mucho?" en cada viaje aunque maneje yo.',
    'Aparte de dar pistas, me gusta que me las den. Pero no esta noche.',
  ],
];

// Falla con un mensaje claro si alguna pista de ejemplo no entra en la tarjeta.
for (const text of clues.flat()) {
  const problem = await checkClue(text);
  if (problem) throw new Error(`${problem} → "${text}"`);
}

const rounds = clues.map((texts, i) => ({
  round: i + 1,
  cards: shuffle(names.map((recipient, k) => ({ recipient, text: texts[k] }))),
}));

const out = process.argv[2] ?? 'muestra-tarjetas.pdf';
await writeFile(out, await buildCardsPdf(rounds));
console.log(`PDF de muestra: ${out}`);
