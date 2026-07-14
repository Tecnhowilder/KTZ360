/**
 * useOrders — hooks React Query para Pedidos
 * 0141: list_orders ahora soporta cursor pagination.
 */
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listOrders, getOrder, createOrder, updateOrderStatus, getOperationsDashboard,
  type CreateOrderInput,
  type ListOrdersResult,
} from '../services/orders';
import type { OrderWithRelations } from '../lib/database.types';

// ── Hook original (retrocompatible) — devuelve solo el array, primera página ──
export function useOrders(status?: string, search?: string) {
  return useQuery<OrderWithRelations[]>({
    queryKey:  ['orders', status ?? 'all', search ?? ''],
    queryFn:   async () => {
      const result = await listOrders(status, search);
      return result.orders;
    },
    staleTime: 30_000,
  });
}

// ── Infinite scroll (useInfiniteQuery) — para listas largas en Pedidos ────────
export function useOrdersInfinite(status?: string, search?: string) {
  return useInfiniteQuery<ListOrdersResult>({
    queryKey:  ['orders-infinite', status ?? 'all', search ?? ''],
    queryFn:   ({ pageParam }) =>
      listOrders(status, search, pageParam as string | undefined),
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? (lastPage.next_cursor ?? undefined) : undefined,
    initialPageParam: undefined,
    staleTime: 30_000,
  });
}

export function useOrderDetail(orderId: string | undefined) {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn:  () => getOrder(orderId!),
    enabled:  !!orderId,
    staleTime: 30_000,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrderInput) => createOrder(input),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['orders-infinite'] });
      qc.invalidateQueries({ queryKey: ['operationsDashboard'] });
    },
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, status, note }: { orderId: string; status: string; note?: string }) =>
      updateOrderStatus(orderId, status, note),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['orders-infinite'] });
      qc.invalidateQueries({ queryKey: ['order', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['operationsDashboard'] });
    },
  });
}

export function useOperationsDashboard() {
  return useQuery({
    queryKey:  ['operationsDashboard'],
    queryFn:   getOperationsDashboard,
    staleTime: 60_000,
  });
}
