/**
 * useOrders — hooks React Query para Pedidos (Sprint 6)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listOrders, getOrder, createOrder, updateOrderStatus, getOperationsDashboard,
  type CreateOrderInput,
} from '../services/orders';

export function useOrders(status?: string, search?: string) {
  return useQuery({
    queryKey:  ['orders', status ?? 'all', search ?? ''],
    queryFn:   () => listOrders(status, search),
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
