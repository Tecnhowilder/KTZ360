import { supabase } from '../lib/supabaseClient';
import type { WorkspaceStorageAddonRow } from '../lib/database.types';

interface RpcResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

async function rpc<T extends RpcResult>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  const result = data as T;
  if (!result.ok) throw new Error(result.error ?? `Error en ${name}`);
  return result;
}

export interface StorageAddonListResponse extends RpcResult {
  addons: WorkspaceStorageAddonRow[];
}

export interface ActivateAddonResponse extends RpcResult {
  addon_id: string;
  gb: number;
  message: string;
}

export interface CancelAddonResponse extends RpcResult {
  message: string;
}

export async function getWorkspaceStorageAddons(workspaceId: string): Promise<WorkspaceStorageAddonRow[]> {
  const data = await rpc<StorageAddonListResponse>('get_workspace_storage_addons', {
    p_workspace_id: workspaceId,
  });
  return data.addons ?? [];
}

export async function activateStorageAddon(
  workspaceId: string,
  gb: 10 | 25 | 50,
  unitPrice: number
): Promise<ActivateAddonResponse> {
  const data = await rpc<ActivateAddonResponse>('activate_storage_addon', {
    p_workspace_id: workspaceId,
    p_gb: gb,
    p_unit_price: unitPrice,
  });
  return data;
}

export async function cancelStorageAddon(addonId: string): Promise<CancelAddonResponse> {
  const data = await rpc<CancelAddonResponse>('cancel_storage_addon', {
    p_addon_id: addonId,
  });
  return data;
}
