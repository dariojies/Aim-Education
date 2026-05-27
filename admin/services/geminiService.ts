
import { SportCategory, DifficultyLevel, Student, Group, Game, Session } from '../types';
import * as storage from './storage';

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
  const res = await fetch('/api/ai/generate-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, language, sportName: sportConfig.name })
  });
  if (!res.ok) throw new Error('Error al generar ejercicio con IA.');
  return res.json();
};

export const consultAICoach = async (
  userMessage: string,
  dataContext: { students: Student[], groups: Group[], games: Game[], sessions: Session[] },
  language: 'en' | 'es' = 'en'
): Promise<string> => {
  const sport = storage.getSportConfig();
  const res = await fetch('/api/ai/consult', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: userMessage,
      dataContext,
      language,
      sportName: sport.name
    })
  });
  if (!res.ok) return 'Error al conectar con el AI Coach.';
  const data = await res.json();
  return data.text || 'Sin respuesta.';
};
