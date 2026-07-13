/**
 * document-wizard — Módulo compartido de wizard para documentos comerciales.
 *
 * ESTADO: Transición (ver ADR-001-document-engine.md)
 * Los componentes StepClient, StepItems, StepCosts, AddItemSheet re-exportan
 * desde components/quote-new/ hasta que se complete la migración definitiva.
 * WizardProgress y WizardStepPreview son componentes nuevos y propios.
 *
 * Regla: Cotizaciones importa desde quote-new/ directamente (sin cambios).
 *        Pedidos y futuros documentos importan desde aquí.
 */

// Wizard genérico propio
export { WizardProgress } from './WizardProgress';
export { WizardStepPreview } from './WizardStepPreview';

// Compartidos (re-exportados desde quote-new mientras dure la transición)
export { StepClient, type StepClientData } from '../quote-new/StepClient';
export { StepItems } from '../quote-new/StepItems';
export { StepCosts } from '../quote-new/StepCosts';
export { AddItemSheet } from '../quote-new/AddItemSheet';
