/**
 * useWorkOrders — hooks React Query para Órdenes de Trabajo (Sprint 6)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listWorkOrders, createWorkOrder, updateWorkOrderStatus, assignWorkOrder, addWorkLogComment,
  type CreateWorkOrderInput,
} from '../services/workOrders';

export function useWorkOrders(opts?: { orderId?: string; status?: string; priority?: string }) {
  return useQuery({
    queryKey:  ['workOrders', opts?.orderId ?? 'all', opts?.status ?? 'all'],
    queryFn:   () => listWorkOrders(opts),
    staleTime: 30_000,
  });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkOrderInput) => createWorkOrder(input),
    onSuccess:  (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['workOrders'] });
      qc.invalidateQueries({ queryKey: ['order', vars.orderId] });
      qc.invalidateQueries({ queryKey: ['operationsDashboard'] });
    },
  });
}

export function useUpdateWorkOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ woId, status, note }: { woId: string; status: string; note?: string }) =>
      updateWorkOrderStatus(woId, status, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workOrders'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['operationsDashboard'] });
    },
  });
}

export function useAssignWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ woId, userId }: { woId: string; userId: string }) =>
      assignWorkOrder(woId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workOrders'] });
    },
  });
}

export function useAddWorkLogComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addWorkLogComment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['workOrders'] });
    },
  });
}
