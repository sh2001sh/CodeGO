import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  codegoApi,
  type CodeGoSubmitDiagnosticReportInput,
  type CodeGoStartAuthInput,
  type CodeGoPollAuthInput,
  type CodeGoUsageLogsQuery,
} from "@/lib/api/codego";

const CODEGO_AUTO_REFRESH_INTERVAL_MS = 3 * 60 * 1000;

export const codegoKeys = {
  all: ["codego"] as const,
  auth: () => [...codegoKeys.all, "auth"] as const,
  summary: () => [...codegoKeys.all, "summary"] as const,
  devices: () => [...codegoKeys.all, "devices"] as const,
  diagnosticPreview: () => [...codegoKeys.all, "diagnostic-preview"] as const,
  trends: (days: number) => [...codegoKeys.all, "trends", days] as const,
  tokens: (query?: { p?: number; size?: number }) =>
    [...codegoKeys.all, "tokens", query ?? {}] as const,
  logs: (query?: CodeGoUsageLogsQuery) =>
    [...codegoKeys.all, "logs", query ?? {}] as const,
};

export const useCodeGoAuthQuery = () =>
  useQuery({
    queryKey: codegoKeys.auth(),
    queryFn: () => codegoApi.getAuthState(),
  });

export const useCodeGoSummaryQuery = (
  enabled: boolean,
  autoRefreshEnabled: boolean,
) =>
  useQuery({
    queryKey: codegoKeys.summary(),
    queryFn: () => codegoApi.getAccountSummary(),
    enabled,
    refetchInterval:
      enabled && autoRefreshEnabled ? CODEGO_AUTO_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });

export const useCodeGoAuthorizedDevicesQuery = (enabled: boolean) =>
  useQuery({
    queryKey: codegoKeys.devices(),
    queryFn: () => codegoApi.listAuthorizedDevices(),
    enabled,
  });

export const useCodeGoDiagnosticPreviewQuery = (enabled: boolean) =>
  useQuery({
    queryKey: codegoKeys.diagnosticPreview(),
    queryFn: () => codegoApi.getDiagnosticPreview(),
    enabled,
  });

export const useCodeGoTokensQuery = (
  query: { p?: number; size?: number } | undefined,
  enabled: boolean,
) =>
  useQuery({
    queryKey: codegoKeys.tokens(query),
    queryFn: () => codegoApi.getTokens(query),
    enabled,
  });

export const useCodeGoUsageTrendsQuery = (days: number, enabled: boolean) =>
  useQuery({
    queryKey: codegoKeys.trends(days),
    queryFn: () => codegoApi.getUsageTrends(days),
    enabled,
  });

export const useCodeGoUsageLogsQuery = (
  query: CodeGoUsageLogsQuery | undefined,
  enabled: boolean,
) =>
  useQuery({
    queryKey: codegoKeys.logs(query),
    queryFn: () => codegoApi.getUsageLogs(query),
    enabled,
  });

export const useCodeGoStartAuthSessionMutation = () => {
  return useMutation({
    mutationFn: (input: CodeGoStartAuthInput | undefined) =>
      codegoApi.startAuthSession(input),
  });
};

export const useCodeGoPollAuthSessionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CodeGoPollAuthInput) =>
      codegoApi.pollAuthSession(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: codegoKeys.auth() });
      await queryClient.invalidateQueries({ queryKey: codegoKeys.summary() });
      await queryClient.invalidateQueries({ queryKey: codegoKeys.devices() });
      await queryClient.invalidateQueries({
        queryKey: [...codegoKeys.all, "trends"],
      });
      await queryClient.invalidateQueries({
        queryKey: [...codegoKeys.all, "logs"],
      });
    },
  });
};

export const useCodeGoLogoutMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => codegoApi.logout(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: codegoKeys.auth() });
      await queryClient.removeQueries({ queryKey: codegoKeys.summary() });
      await queryClient.removeQueries({ queryKey: codegoKeys.devices() });
      await queryClient.removeQueries({
        queryKey: [...codegoKeys.all, "trends"],
      });
      await queryClient.removeQueries({
        queryKey: [...codegoKeys.all, "tokens"],
      });
      await queryClient.removeQueries({
        queryKey: [...codegoKeys.all, "logs"],
      });
    },
  });
};

export const useCodeGoRevokeAuthorizedDeviceMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => codegoApi.revokeAuthorizedDevice(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: codegoKeys.auth() });
      await queryClient.invalidateQueries({ queryKey: codegoKeys.devices() });
      await queryClient.invalidateQueries({ queryKey: codegoKeys.summary() });
    },
  });
};

export const useCodeGoCreateTokenMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: codegoApi.createToken,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: codegoKeys.summary() });
      await queryClient.invalidateQueries({
        queryKey: [...codegoKeys.all, "tokens"],
      });
    },
  });
};

export const useCodeGoUpdateTokenMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: codegoApi.updateToken,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: codegoKeys.summary() });
      await queryClient.invalidateQueries({
        queryKey: [...codegoKeys.all, "tokens"],
      });
    },
  });
};

export const useCodeGoDeleteTokenMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: codegoApi.deleteToken,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: codegoKeys.summary() });
      await queryClient.invalidateQueries({
        queryKey: [...codegoKeys.all, "tokens"],
      });
    },
  });
};

export const useCodeGoSubmitDiagnosticReportMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input?: CodeGoSubmitDiagnosticReportInput) =>
      codegoApi.submitDiagnosticReport(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: codegoKeys.diagnosticPreview(),
      });
    },
  });
};
