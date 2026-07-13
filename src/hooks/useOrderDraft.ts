/**
 * useOrderDraft — Borrador de Pedidos basado en el Document Engine.
 *
 * Usa createDraftHooks con clave 'ktz_order_draft_v2' (distinta a
 * 'ktz_quote_draft_v2' de useDraftQuote.ts) para evitar colisiones.
 *
 * useDraftQuote.ts NO se modifica.
 */
import type { StepClientData } from '../components/quote-new/StepClient';
import type { QuoteItem, LaborItem, CostConfig } from '../lib/itemEngine';
import { createDraftHooks } from '../lib/document-engine';

export interface OrderDraftV2 {
  version:     2;
  workspaceId: string;
  savedAt:     string;
  currentStep: number;
  clientData:  StepClientData;
  items:       QuoteItem[];
  laborItems:  LaborItem[];
  costConfig:  CostConfig;
  orderName:   string;
}

export const EMPTY_ORDER_CLIENT: StepClientData = {
  clientId: null, clientName: '', clientEmail: undefined,
  projectName: '', description: '',
};

const hooks = createDraftHooks<OrderDraftV2>('ktz_order_draft_v2', 2);

export const saveOrderDraft   = hooks.save;
export const loadOrderDraft   = hooks.load;
export const clearOrderDraft  = hooks.clear;
export const hasOrderDraft    = hooks.has;
export const useOrderAutosave = hooks.useAutosave;
