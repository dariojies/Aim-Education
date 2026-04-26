
import { GoogleGenAI, Type } from "@google/genai";
import { SportCategory, DifficultyLevel, Student, Group, Game, Session } from "../types";
import * as storage from "./storage";

export interface AIGameSuggestion {
  title: string;
  description: string;
  category: SportCategory;
  difficulty: DifficultyLevel;
  durationMin: number;
}

export const generateGameIdea = async (
  prompt: string, 
  language: 'en' | 'es' = 'en',
): Promise<AIGameSuggestion> => {
  const sportConfig = storage.getSportConfig();
  const langPrompt = language === 'es' ? 'Salida puramente en Español.' : 'Output purely in English.';
  const finalPrompt = `Crea un ejercicio o juego de entrenamiento para ${sportConfig.name} enfocado en: ${prompt}. Asegúrate de que las reglas sean claras y acordes al deporte ${sportConfig.name}. ${langPrompt}`;

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: finalPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            category: { type: Type.STRING },
            difficulty: { type: Type.STRING },
            durationMin: { type: Type.INTEGER }
          },
          required: ["title", "description", "category", "difficulty", "durationMin"]
        }
      }
    });
    return JSON.parse(response.text || '{}') as AIGameSuggestion;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const consultAICoach = async (
  userMessage: string,
  dataContext: { students: Student[], groups: Group[], games: Game[], sessions: Session[] },
  language: 'en' | 'es' = 'en'
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const sport = storage.getSportConfig();
  
  const systemInstruction = `
    Eres un Consultor Experto en Gestión Deportiva para el club "AIM". 
    Tu deporte actual es: ${sport.name}.
    Idioma de respuesta: ${language === 'es' ? 'Español' : 'Inglés'}.
    
    Tienes acceso a los siguientes datos (resumen):
    - Alumnos totales: ${dataContext.students.length}
    - Grupos: ${dataContext.groups.map(g => g.name).join(', ')}
    - Ejercicios en biblioteca: ${dataContext.games.length}
    - Sesiones planificadas: ${dataContext.sessions.length}

    Tu tarea es ayudar al entrenador a gestionar el club, analizar la asistencia, sugerir calendarios de entrenamiento o responder dudas técnicas.
    Sé profesional, conciso y motivador. Usa Markdown para formatear las respuestas.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: userMessage,
      config: { systemInstruction }
    });
    return response.text || "No response";
  } catch (error) {
    return "Error connecting to AI Coach. Please check your API key.";
  }
};
