/**
 * useAIMode — Hook para gestionar el modo de IA del usuario
 *
 * Modos disponibles:
 *   balanced — Mejor equilibrio calidad/velocidad/costo (por defecto)
 *   quality  — Máxima calidad (puede usar modelos más potentes, mismos créditos)
 *   economy  — Mínimo costo (modelos más ligeros, mismos créditos)
 *   auto     — El Orchestrator decide según la operación y carga actual
 *
 * Importante: el modo es un HINT para el Orchestrator.
 * El Orchestrator puede ignorarlo si la operación lo requiere.
 * Los créditos consumidos son los mismos independientemente del modo.
 * El usuario NUNCA ve qué proveedor o modelo se usa.
 */
import { useState, useCallback } from 'react';

export type AIMode = 'balanced' | 'quality' | 'economy' | 'auto';

const STORAGE_KEY = 'shelwi_ai_mode';

export interface AIModeOption {
  value:       AIMode;
  label:       string;
  description: string;
  icon:        string;
}

export const AI_MODE_OPTIONS: AIModeOption[] = [
  {
    value:       'balanced',
    label:       'Balanceado',
    description: 'Mejor combinación de velocidad, calidad y eficiencia',
    icon:        '⚖️',
  },
  {
    value:       'quality',
    label:       'Máxima Calidad',
    description: 'Resultados más precisos y detallados',
    icon:        '✨',
  },
  {
    value:       'economy',
    label:       'Máximo Ahorro',
    description: 'Respuestas rápidas para tareas simples',
    icon:        '⚡',
  },
  {
    value:       'auto',
    label:       'Automático',
    description: 'Shelwi AI decide el modo óptimo por operación',
    icon:        '🤖',
  },
];

function loadMode(): AIMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ['balanced','quality','economy','auto'].includes(stored)) {
      return stored as AIMode;
    }
  } catch { /* noop */ }
  return 'balanced';
}

function saveMode(mode: AIMode): void {
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* noop */ }
}

export function useAIMode() {
  const [mode, setModeState] = useState<AIMode>(loadMode);

  const setMode = useCallback((newMode: AIMode) => {
    setModeState(newMode);
    saveMode(newMode);
  }, []);

  const currentOption = AI_MODE_OPTIONS.find(o => o.value === mode) ?? AI_MODE_OPTIONS[0];

  return { mode, setMode, currentOption, options: AI_MODE_OPTIONS };
}

/** Función standalone para leer el modo actual (fuera de componentes React) */
export function getCurrentAIMode(): AIMode {
  return loadMode();
}
