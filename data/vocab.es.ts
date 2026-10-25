/** Spanish lexicon. Level 1 = word, 2 = short phrase, 3 = sentence. */
import { makeVocab, type Vocab } from "./vocab";

const v = (theme: Vocab["theme"], level: 1 | 2 | 3, text: string, en: string, focus?: string): Vocab => makeVocab("es", theme, level, text, en, undefined, focus);

export const vocabEs: Vocab[] = [
  // nature
  v("nature", 1, "fuego", "fire", "soft g, 'ue' glide"), v("nature", 1, "agua", "water", "'gua' as one syllable"), v("nature", 1, "viento", "wind", "'v' sounds like 'b'"),
  v("nature", 1, "tierra", "earth", "rolled 'rr'"), v("nature", 1, "montaña", "mountain", "'ñ' like 'ny' in canyon"), v("nature", 1, "río", "river", "stress on 'rí'"),
  v("nature", 1, "bosque", "forest", "'que' = 'ke'"), v("nature", 1, "piedra", "stone", "'ie' glide"), v("nature", 1, "cielo", "sky", "'c' before 'i' is soft"),
  v("nature", 2, "el río crece", "the river rises"), v("nature", 2, "piedra fría", "cold stone"), v("nature", 2, "bajo la tierra", "under the earth"),
  v("nature", 3, "el viento sopla fuerte", "the wind blows hard"), v("nature", 3, "la montaña duerme bajo la nieve", "the mountain sleeps under the snow"), v("nature", 3, "el bosque guarda silencio", "the forest keeps silent"),
  // weather
  v("weather", 1, "sol", "sun"), v("weather", 1, "lluvia", "rain", "'ll' like 'y'"), v("weather", 1, "nieve", "snow"), v("weather", 1, "tormenta", "storm", "tap the 'r'"),
  v("weather", 1, "niebla", "fog"), v("weather", 1, "trueno", "thunder", "tap the 'r'"), v("weather", 1, "hielo", "ice", "silent 'h'"), v("weather", 1, "relámpago", "lightning", "stress on 'lám'"),
  v("weather", 2, "hace frío", "it's cold", "silent 'h'"), v("weather", 2, "llueve mucho", "it rains a lot"), v("weather", 2, "sol de invierno", "winter sun"),
  v("weather", 3, "mañana va a llover", "tomorrow it will rain"), v("weather", 3, "la tormenta llega esta noche", "the storm arrives tonight"), v("weather", 3, "la niebla cubre el valle", "the fog covers the valley"),
  // animals
  v("animals", 1, "lobo", "wolf"), v("animals", 1, "gato", "cat"), v("animals", 1, "perro", "dog", "rolled 'rr'"), v("animals", 1, "pájaro", "bird", "stress on 'pá'"),
  v("animals", 1, "serpiente", "snake"), v("animals", 1, "caballo", "horse", "'ll' like 'y'"), v("animals", 1, "dragón", "dragon", "stress on 'gón'"), v("animals", 1, "oso", "bear"),
  v("animals", 2, "el lobo negro", "the black wolf"), v("animals", 2, "un gato viejo", "an old cat"), v("animals", 2, "el dragón duerme", "the dragon sleeps"),
  v("animals", 3, "el perro corre por el campo", "the dog runs through the field"), v("animals", 3, "la serpiente duerme al sol", "the snake sleeps in the sun"), v("animals", 3, "el pájaro canta al amanecer", "the bird sings at dawn"),
  // body
  v("body", 1, "mano", "hand"), v("body", 1, "ojo", "eye"), v("body", 1, "corazón", "heart", "stress on 'zón'"), v("body", 1, "sangre", "blood", "crisp 'gr'"),
  v("body", 1, "hueso", "bone", "silent 'h', 'ue' glide"), v("body", 1, "cabeza", "head", "'z' soft"), v("body", 1, "boca", "mouth"), v("body", 1, "pie", "foot"),
  v("body", 2, "los ojos rojos", "the red eyes", "'j' is a throaty 'h'"), v("body", 2, "mi corazón late", "my heart beats"), v("body", 2, "manos frías", "cold hands"),
  v("body", 3, "me duele la cabeza", "my head hurts"), v("body", 3, "cierra los ojos y respira", "close your eyes and breathe"), v("body", 3, "la sangre corre por mis venas", "blood runs through my veins"),
  // food
  v("food", 1, "pan", "bread"), v("food", 1, "sal", "salt"), v("food", 1, "miel", "honey", "'ie' glide"), v("food", 1, "vino", "wine", "'v' like 'b'"),
  v("food", 1, "carne", "meat"), v("food", 1, "fruta", "fruit"), v("food", 1, "leche", "milk"), v("food", 1, "huevo", "egg", "silent 'h', 'ue' glide"),
  v("food", 2, "pan con sal", "bread with salt"), v("food", 2, "un vaso de agua", "a glass of water"), v("food", 2, "sopa caliente", "hot soup"),
  v("food", 3, "quiero comer algo caliente", "I want to eat something hot"), v("food", 3, "la sopa está muy salada", "the soup is very salty"), v("food", 3, "el pan está recién hecho", "the bread is freshly made"),
  // emotions
  v("emotions", 1, "miedo", "fear", "'ie' glide"), v("emotions", 1, "rabia", "rage"), v("emotions", 1, "alegría", "joy", "stress on 'grí'"), v("emotions", 1, "dolor", "pain"),
  v("emotions", 1, "esperanza", "hope", "'z' soft"), v("emotions", 1, "odio", "hatred"), v("emotions", 1, "calma", "calm"), v("emotions", 1, "sueño", "dream / sleep", "'ñ'"),
  v("emotions", 2, "sin miedo", "without fear"), v("emotions", 2, "con rabia", "with rage"), v("emotions", 2, "una pequeña esperanza", "a small hope"),
  v("emotions", 3, "no tengo miedo de ti", "I am not afraid of you"), v("emotions", 3, "la esperanza nunca muere", "hope never dies"), v("emotions", 3, "el dolor pasa, la calma vuelve", "the pain passes, calm returns"),
  // time
  v("time", 1, "noche", "night"), v("time", 1, "día", "day"), v("time", 1, "hora", "hour", "silent 'h'"), v("time", 1, "mañana", "tomorrow / morning", "'ñ'"),
  v("time", 1, "tarde", "afternoon / late"), v("time", 1, "siempre", "always"), v("time", 1, "nunca", "never"), v("time", 1, "ahora", "now", "silent 'h'"),
  v("time", 2, "esta noche", "tonight"), v("time", 2, "cada mañana", "every morning"), v("time", 2, "ahora o nunca", "now or never"),
  v("time", 3, "la noche es larga y fría", "the night is long and cold"), v("time", 3, "siempre llegas tarde", "you always arrive late"), v("time", 3, "no queda mucho tiempo", "there isn't much time left"),
  // places
  v("places", 1, "casa", "house"), v("places", 1, "puerta", "door"), v("places", 1, "camino", "path"), v("places", 1, "ciudad", "city", "'d' soft at the end"),
  v("places", 1, "puente", "bridge"), v("places", 1, "torre", "tower", "rolled 'rr'"), v("places", 1, "cueva", "cave"), v("places", 1, "mercado", "market"),
  v("places", 2, "la puerta cerrada", "the closed door"), v("places", 2, "un camino largo", "a long road"), v("places", 2, "dentro de la cueva", "inside the cave"),
  v("places", 3, "la torre cae esta noche", "the tower falls tonight"), v("places", 3, "vamos al mercado temprano", "we go to the market early"), v("places", 3, "el puente cruza el río", "the bridge crosses the river"),
  // actions
  v("actions", 1, "correr", "to run", "tap both r's"), v("actions", 1, "saltar", "to jump"), v("actions", 1, "romper", "to break", "rolled 'r' at the start"), v("actions", 1, "quemar", "to burn"),
  v("actions", 1, "dormir", "to sleep"), v("actions", 1, "gritar", "to shout"), v("actions", 1, "volar", "to fly"), v("actions", 1, "esconder", "to hide"),
  v("actions", 2, "quema todo", "burn everything"), v("actions", 2, "salta ahora", "jump now"), v("actions", 2, "no te escondas", "don't hide"),
  v("actions", 3, "rompe la puerta de hierro", "break the iron door"), v("actions", 3, "no puedes esconderte aquí", "you can't hide here"), v("actions", 3, "grita mi nombre al cielo", "shout my name to the sky"),
  // light
  v("light", 1, "luz", "light"), v("light", 1, "sombra", "shadow"), v("light", 1, "rojo", "red", "'j' throaty"), v("light", 1, "negro", "black"),
  v("light", 1, "blanco", "white"), v("light", 1, "oro", "gold"), v("light", 1, "plata", "silver"), v("light", 1, "brillo", "shine", "'ll' like 'y'"),
  v("light", 2, "luz dorada", "golden light"), v("light", 2, "sombra fría", "cold shadow"), v("light", 2, "un brillo de plata", "a silver gleam"),
  v("light", 3, "la luz rompe la sombra", "the light breaks the shadow"), v("light", 3, "el oro brilla en la oscuridad", "gold shines in the dark"), v("light", 3, "nada escapa de la sombra", "nothing escapes the shadow"),
  // numbers
  v("numbers", 1, "uno", "one"), v("numbers", 1, "dos", "two"), v("numbers", 1, "tres", "three", "tap the 'r'"), v("numbers", 1, "cinco", "five"),
  v("numbers", 1, "diez", "ten", "'z' soft"), v("numbers", 1, "cien", "one hundred"), v("numbers", 1, "mil", "one thousand"), v("numbers", 1, "primero", "first"),
  v("numbers", 2, "dos veces", "twice"), v("numbers", 2, "cien años", "a hundred years", "'ñ'"), v("numbers", 2, "el primero de mayo", "the first of May"),
  v("numbers", 3, "tengo tres hermanos", "I have three siblings"), v("numbers", 3, "mil estrellas en el cielo", "a thousand stars in the sky"), v("numbers", 3, "la campana suena tres veces", "the bell rings three times"),
  // objects
  v("objects", 1, "espada", "sword"), v("objects", 1, "escudo", "shield"), v("objects", 1, "llave", "key", "'ll' like 'y'"), v("objects", 1, "libro", "book"),
  v("objects", 1, "cuerda", "rope", "'ue' glide"), v("objects", 1, "campana", "bell"), v("objects", 1, "espejo", "mirror", "'j' throaty"), v("objects", 1, "vela", "candle"),
  v("objects", 2, "la llave vieja", "the old key"), v("objects", 2, "mi espada rota", "my broken sword"), v("objects", 2, "una vela encendida", "a lit candle"),
  v("objects", 3, "el libro guarda un secreto", "the book keeps a secret"), v("objects", 3, "el espejo no miente", "the mirror doesn't lie"), v("objects", 3, "la cuerda se rompe bajo el peso", "the rope snaps under the weight"),
];

