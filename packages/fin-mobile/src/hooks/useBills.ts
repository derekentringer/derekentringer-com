import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateBillRequest,
  UpdateBillRequest,
} from "@derekentringer/shared/finance";
import {
  fetchBills,
  fetchBill,
  fetchUpcomingBills,
  createBill,
  updateBill,
  deleteBill,
  markBillPaid,
  unmarkBillPaid,
} from "@/api/bills";

export function useBills(active?: boolean) {
  return useQuery({
    queryKey: ["bills", { active }],
    queryFn: () => fetchBills(active),
  });
}

export function useBill(id: string) {
  return useQuery({
    queryKey: ["bills", id],
    queryFn: () => fetchBill(id),
    enabled: !!id,
  });
}

export function useUpcomingBills(days = 60) {
  return useQuery({
    queryKey: ["bills", "upcoming", days],
    queryFn: () => fetchUpcomingBills(days),
  });
}

export function useCreateBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBillRequest) => createBill(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBillRequest }) =>
      updateBill(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["bills", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinToken }: { id: string; pinToken: string }) =>
      deleteBill(id, pinToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useMarkBillPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      dueDate,
      amount,
    }: {
      id: string;
      dueDate: string;
      amount?: number;
    }) => markBillPaid(id, dueDate, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUnmarkBillPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dueDate }: { id: string; dueDate: string }) =>
      unmarkBillPaid(id, dueDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
