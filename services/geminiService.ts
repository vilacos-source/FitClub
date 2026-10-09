
import { GoogleGenAI } from "@google/genai";
import { User, PublicProfile } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const DEFAULT_MOTIVATIONAL = [
  "¡A tope {name}! ¡Dale caña que tú puedes! 💪",
  "¿Cómo va eso, {name}? ¡A seguir sumando puntos! 🔥",
  "¡Vaya crack estás hecho, {name}! Ni un paso atrás. 🚀",
  "¡Ojo, que {name} viene pisando fuerte hoy! 👟",
  "Ni el azúcar ni la pereza pueden contigo, {name}. ¡Vamos! 🍎",
  "¿Has visto el ranking? ¡{name}, estás a tope! 📈"
];

const DEFAULT_WELCOME = [
  "¡Bienvenido al lío, {name}! Sales con {weight}kg, ¡ahora a por todas! 💪🚀",
  "¡Vaya fichaje el de {name}! Esos {weight}kg van a volar. 🌪️",
  "¡Ya no hay vuelta atrás, {name}! Empezamos con {weight}kg. ¡Dale! 🎯"
];

const replacePlaceholders = (text: string, user: User) => {
  return text
    .replace(/{name}/g, user.pseudonym)
    .replace(/{weight}/g, user.initialWeight.toString());
};

export const getMotivationalMessage = async (user: User, leaderboard: PublicProfile[]) => {
  const position = leaderboard.findIndex(u => u.id === user.id) + 1;
  const lastChange = user.history.length > 0 ? user.history[user.history.length - 1].delta : 0;
  
  const prompt = `
    Contexto: Un reto de pérdida de peso entre amigos basado en puntos (FitClub).
    Usuario: ${user.realName} (Pseudónimo: ${user.pseudonym})
    Puesto actual: ${position} de ${leaderboard.length}
    Último registro: ${lastChange === 0 ? 'empezando' : lastChange < 0 ? 'ha bajado peso' : 'ha subido un poco'}
    Puntos totales: ${user.totalPoints}
    
    Genera un mensaje MUY INFORMAL y divertido (máximo 2 frases cortas) en español de España.
    REGLAS DE ESTILO:
    - Habla como un colega en un grupo de WhatsApp. Usa "tú".
    - Usa expresiones naturales como: "¡A tope!", "¡Vaya crack!", "Ni tan mal", "Dale caña", "Ojo ahí", "A seguir dándole".
    - Dirígete a él SOLO por su pseudónimo "${user.pseudonym}".
    - Si va en los primeros puestos, sé un poco "fan".
    - Si ha subido de peso, no seas serio, dile algo tipo "no pasa nada, mañana se entrena el doble" o "las bravas de ayer pesaron, ¿eh?".
    - Si va último, dale ánimos con humor.
    - Usa emojis divertidos.
    - NUNCA menciones kilos exactos ni seas formal.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Gemini API Error (likely quota):", message);
    const randomFallback = DEFAULT_MOTIVATIONAL[Math.floor(Math.random() * DEFAULT_MOTIVATIONAL.length)];
    return replacePlaceholders(randomFallback, user);
  }
};

export const getWelcomeMessage = async (user: User) => {
  const prompt = `
    Contexto: Un nuevo usuario se acaba de unir a "FitClub", un reto de pérdida de peso entre amigos.
    Usuario: ${user.realName} (Pseudónimo: ${user.pseudonym})
    Peso inicial: ${user.initialWeight} kg
    
    Genera un mensaje de BIENVENIDA MUY INFORMAL, divertido y motivador (máximo 2 frases cortas) en español de España.
    REGLAS DE ESTILO:
    - Habla como un colega en un grupo de WhatsApp. Usa "tú".
    - Menciona obligatoriamente su pseudónimo "${user.pseudonym}" y su peso de salida de ${user.initialWeight} kg.
    - Usa expresiones naturales como: "¡Bienvenido al lío!", "¡A por todas!", "Menudo fichaje", "Ya no hay vuelta atrás", "¡Ojo con el peso de salida!".
    - Sé muy animado y un poco bromista pero respetuoso.
    - Usa emojis de comida o deporte.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Gemini API Welcome Error:", message);
    const randomFallback = DEFAULT_WELCOME[Math.floor(Math.random() * DEFAULT_WELCOME.length)];
    return replacePlaceholders(randomFallback, user);
  }
};
