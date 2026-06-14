import { supabase } from '../lib/supabaseClient';
import type { CatalogCategoryRow, CatalogServiceRow, CatalogMaterialRow } from '../lib/database.types';
import type { ServiceWithRules, PriceOverrideMap } from '../lib/engine';

export async function listCategories(): Promise<CatalogCategoryRow[]> {
  const { data, error } = await supabase
    .from('catalog_categories')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listServicesByCategory(categoryId: string): Promise<CatalogServiceRow[]> {
  const { data, error } = await supabase
    .from('catalog_services')
    .select('*')
    .eq('category_id', categoryId)
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data;
}

const SERVICE_WITH_RULES_SELECT = `
  *,
  variants:catalog_variants(*),
  questions:catalog_questions(*, options:catalog_question_options(*)),
  materialRules:catalog_material_rules(*, material:catalog_materials(*)),
  laborRules:catalog_labor_rules(*),
  equipmentRules:catalog_equipment_rules(*)
`;

export async function getServiceWithRules(serviceId: string): Promise<ServiceWithRules> {
  const { data, error } = await supabase
    .from('catalog_services')
    .select(SERVICE_WITH_RULES_SELECT)
    .eq('id', serviceId)
    .single();
  if (error) throw error;

  const raw = data as unknown as ServiceWithRules & {
    variants: ServiceWithRules['variants'] | null;
    questions: (ServiceWithRules['questions'][number] & { options: ServiceWithRules['questions'][number]['options'] | null })[] | null;
    materialRules: ServiceWithRules['materialRules'] | null;
    laborRules: ServiceWithRules['laborRules'] | null;
    equipmentRules: ServiceWithRules['equipmentRules'] | null;
  };

  return {
    ...raw,
    variants: (raw.variants ?? []).sort((a, b) => a.sort_order - b.sort_order),
    questions: (raw.questions ?? [])
      .map(q => ({ ...q, options: (q.options ?? []).sort((a, b) => a.sort_order - b.sort_order) }))
      .sort((a, b) => a.sort_order - b.sort_order),
    materialRules: (raw.materialRules ?? []).sort((a, b) => a.sort_order - b.sort_order),
    laborRules: (raw.laborRules ?? []).sort((a, b) => a.sort_order - b.sort_order),
    equipmentRules: (raw.equipmentRules ?? []).sort((a, b) => a.sort_order - b.sort_order),
  };
}

export async function listPriceOverrides(workspaceId: string): Promise<PriceOverrideMap> {
  const { data, error } = await supabase
    .from('workspace_price_overrides')
    .select('entity_type, entity_id, custom_price')
    .eq('workspace_id', workspaceId);
  if (error) throw error;
  const map: PriceOverrideMap = new Map();
  for (const row of data) map.set(`${row.entity_type}:${row.entity_id}`, row.custom_price);
  return map;
}

export async function upsertPriceOverride(
  workspaceId: string,
  entityType: 'material' | 'labor' | 'equipment',
  entityId: string,
  customPrice: number,
): Promise<void> {
  const { error } = await supabase
    .from('workspace_price_overrides')
    .upsert({ workspace_id: workspaceId, entity_type: entityType, entity_id: entityId, custom_price: customPrice }, { onConflict: 'workspace_id,entity_type,entity_id' });
  if (error) throw error;
}

export async function deletePriceOverride(workspaceId: string, entityType: 'material' | 'labor' | 'equipment', entityId: string): Promise<void> {
  const { error } = await supabase
    .from('workspace_price_overrides')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);
  if (error) throw error;
}

/** Busca servicios por nombre en cualquier categoría (para el buscador del paso "Servicio"). */
export async function searchServices(query: string): Promise<(CatalogServiceRow & { category_name: string | null })[]> {
  const { data, error } = await supabase
    .from('catalog_services')
    .select('*, category:catalog_categories(name)')
    .eq('active', true)
    .ilike('name', `%${query}%`)
    .order('name', { ascending: true })
    .limit(20);
  if (error) throw error;
  return (data as unknown as (CatalogServiceRow & { category: { name: string } | null })[]).map((r) => ({ ...r, category_name: r.category?.name ?? null }));
}

export async function listCatalogMaterials(): Promise<CatalogMaterialRow[]> {
  const { data, error } = await supabase
    .from('catalog_materials')
    .select('*')
    .eq('active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return data;
}
