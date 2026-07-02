import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  codegoApi,
  type CodeGoAuthState,
  type CodeGoSubmitDiagnosticReportInput,
  type CodeGoStartAuthInput,
  type CodeGoPollAuthInput,
  type CodeGoUsageLogsQuery,
} from "@/lib/api/codego";

const CODEGO_AUTO_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
const CODEGO_AUTH_SYNC_RETRY_MS = 220;
const CODEGO_AUTH_EXPIRED_MESSAGE = "Code Go 授权已失效，请重新授权。";

export const codegoKeys = {
  all: ["codego"] as const,
  auth: () => [...codegoKeys.all, "auth"] as const,
  summary: () => [...codegoKeys.all, "summary"] as const,
  devices: () => [...codegoKeys.all, "devices"] as const,
  diagnosticPreview: () => [...codegoKeys.all, "diagnostic-preview"] as const,
  trends: (days: number) => [...codegoKeys.all, "trends", days] as const,
  groups: () => [...codegoKeys.all, "groups"] as const,
  groupStatus: () => [...codegoKeys.all, "group-status"] as const,
  tokens: (query?: { p?: number; size?: number }) =>
    [...codegoKeys.all, "tokens", query ?? {}] as const,
  logs: (query?: CodeGoUsageLogsQuery) =>
    [...codegoKeys.all, "logs", query ?? {}] as const,
};

function codeGoErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? "");
}

function isCodeGoAuthExpiredError(error: unknown) {
  const message = codeGoErrorMessage(error).toLowerCase();
  return (
    message.includes("invalid access token") ||
    message.includes("unauthorized") ||
    message.includes("invalid token") ||
    message.includes("尚未授权") ||
    message.includes("授权已失效") ||
    message.includes("授权信息不完整")
  );
}

function markCodeGoAuthExpired(queryClient: QueryClient) {
  queryClient.setQueryData<CodeGoAuthState | undefined>(
    codegoKeys.auth(),
    (current) => ({
      ...current,
      authenticated: false,
      accessToken: undefined,
      userId: undefined,
      deviceId: undefined,
    }),
  );
  queryClient.removeQueries({ queryKey: codegoKeys.summary() });
  queryClient.removeQueries({ queryKey: codegoKeys.devices() });
  queryClient.removeQueries({ queryKey: codegoKeys.groups() });
  queryClient.removeQueries({ queryKey: codegoKeys.groupStatus() });
  queryClient.removeQueries({ queryKey: [...codegoKeys.all, "tokens"] });
  queryClient.removeQueries({ queryKey: [...codegoKeys.all, "trends"] });
  queryClient.removeQueries({ queryKey: [...codegoKeys.all, "logs"] });
  void queryClient.invalidateQueries({ queryKey: codegoKeys.auth() });
}

async function withCodeGoAuthGuard<T>(
  queryClient: QueryClient,
  action: () => Promise<T>,
) {
  try {
    return await action();
  } catch (error) {
    if (isCodeGoAuthExpiredError(error)) {
      markCodeGoAuthExpired(queryClient);
      try {
        queryClient.setQueryData(
          codegoKeys.auth(),
          await codegoApi.getAuthState(),
        );
      } catch {
        // The optimistic unauthenticated state above is still safer than
        // continuing to show stale connected data.
      }
      throw new Error(CODEGO_AUTH_EXPIRED_MESSAGE);
    }
    throw error;
  }
}

async function withCodeGoAuxiliaryGuard<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    if (isCodeGoAuthExpiredError(error)) {
      throw new Error(codeGoErrorMessage(error) || "Code Go 数据读取失败。");
    }
    throw error;
  }
}

export const useCodeGoAuthQuery = () =>
  useQuery({
    queryKey: codegoKeys.auth(),
    queryFn: () => codegoApi.getAuthState(),
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

const waitForNextAttempt = async (delayMs: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });

export async function syncCodeGoDesktopAuthState(
  queryClient: QueryClient,
  maxAttempts = 4,
  optimisticAuthState?: Partial<CodeGoAuthState>,
) {
  let attempts = 0;
  let authState = await codegoApi.getAuthState();

  while (!authState.authenticated && attempts < maxAttempts - 1) {
    attempts += 1;
    await waitForNextAttempt(CODEGO_AUTH_SYNC_RETRY_MS * attempts);
    authState = await codegoApi.getAuthState();
  }

  queryClient.setQueryData(codegoKeys.auth(), authState);

  if (!authState.authenticated) {
    if (!optimisticAuthState) {
      throw new Error(
        "Code Go desktop authorization has not finished syncing yet",
      );
    }

    authState = {
      ...authState,
      ...optimisticAuthState,
      authenticated: true,
    };
    queryClient.setQueryData(codegoKeys.auth(), authState);
  }

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: codegoKeys.summary() }),
    queryClient.invalidateQueries({ queryKey: codegoKeys.devices() }),
    queryClient.invalidateQueries({
      queryKey: [...codegoKeys.all, "tokens"],
    }),
    queryClient.invalidateQueries({ queryKey: codegoKeys.groups() }),
    queryClient.invalidateQueries({ queryKey: codegoKeys.groupStatus() }),
    queryClient.invalidateQueries({
      queryKey: [...codegoKeys.all, "trends"],
    }),
    queryClient.invalidateQueries({
      queryKey: [...codegoKeys.all, "logs"],
    }),
  ]);

  await Promise.allSettled([
    queryClient.fetchQuery({
      queryKey: codegoKeys.summary(),
      queryFn: () =>
        withCodeGoAuthGuard(queryClient, () => codegoApi.getAccountSummary()),
      staleTime: 0,
    }),
    queryClient.fetchQuery({
      queryKey: codegoKeys.devices(),
      queryFn: () =>
        withCodeGoAuxiliaryGuard(() => codegoApi.listAuthorizedDevices()),
      staleTime: 0,
    }),
    queryClient.fetchQuery({
      queryKey: codegoKeys.groups(),
      queryFn: () => withCodeGoAuxiliaryGuard(() => codegoApi.getGroups()),
      staleTime: 0,
    }),
    queryClient.fetchQuery({
      queryKey: codegoKeys.groupStatus(),
      queryFn: () => withCodeGoAuxiliaryGuard(() => codegoApi.getGroupStatus()),
      staleTime: 0,
    }),
  ]);

  return authState;
}

export const useCodeGoSummaryQuery = (
  enabled: boolean,
  autoRefreshEnabled: boolean,
) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: codegoKeys.summary(),
    queryFn: () =>
      withCodeGoAuthGuard(queryClient, () => codegoApi.getAccountSummary()),
    enabled,
    refetchInterval:
      enabled && autoRefreshEnabled ? CODEGO_AUTO_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });
};

export const useCodeGoAuthorizedDevicesQuery = (enabled: boolean) => {
  return useQuery({
    queryKey: codegoKeys.devices(),
    queryFn: () =>
      withCodeGoAuxiliaryGuard(() => codegoApi.listAuthorizedDevices()),
    enabled,
  });
};

export const useCodeGoDiagnosticPreviewQuery = (enabled: boolean) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: codegoKeys.diagnosticPreview(),
    queryFn: () =>
      withCodeGoAuthGuard(queryClient, () => codegoApi.getDiagnosticPreview()),
    enabled,
  });
};

export const useCodeGoTokensQuery = (
  query: { p?: number; size?: number } | undefined,
  enabled: boolean,
) => {
  return useQuery({
    queryKey: codegoKeys.tokens(query),
    queryFn: () => withCodeGoAuxiliaryGuard(() => codegoApi.getTokens(query)),
    enabled,
  });
};

export const useCodeGoGroupsQuery = (enabled: boolean) => {
  return useQuery({
    queryKey: codegoKeys.groups(),
    queryFn: () => withCodeGoAuxiliaryGuard(() => codegoApi.getGroups()),
    enabled,
  });
};

export const useCodeGoGroupStatusQuery = (enabled: boolean) => {
  return useQuery({
    queryKey: codegoKeys.groupStatus(),
    queryFn: () => withCodeGoAuxiliaryGuard(() => codegoApi.getGroupStatus()),
    enabled,
  });
};

export const useCodeGoUsageTrendsQuery = (days: number, enabled: boolean) => {
  return useQuery({
    queryKey: codegoKeys.trends(days),
    queryFn: () =>
      withCodeGoAuxiliaryGuard(() => codegoApi.getUsageTrends(days)),
    enabled,
  });
};

export const useCodeGoUsageLogsQuery = (
  query: CodeGoUsageLogsQuery | undefined,
  enabled: boolean,
) => {
  return useQuery({
    queryKey: codegoKeys.logs(query),
    queryFn: () =>
      withCodeGoAuxiliaryGuard(() => codegoApi.getUsageLogs(query)),
    enabled,
  });
};

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
      await queryClient.invalidateQueries({ queryKey: codegoKeys.groups() });
      await queryClient.invalidateQueries({
        queryKey: codegoKeys.groupStatus(),
      });
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
  const clearCodeGoSessionCache = () => {
    queryClient.setQueryData<CodeGoAuthState | undefined>(
      codegoKeys.auth(),
      (current) => ({
        ...current,
        authenticated: false,
        accessToken: undefined,
        userId: undefined,
        deviceId: undefined,
      }),
    );
    queryClient.removeQueries({ queryKey: codegoKeys.summary() });
    queryClient.removeQueries({ queryKey: codegoKeys.devices() });
    queryClient.removeQueries({ queryKey: codegoKeys.groups() });
    queryClient.removeQueries({ queryKey: codegoKeys.groupStatus() });
    queryClient.removeQueries({
      queryKey: [...codegoKeys.all, "trends"],
    });
    queryClient.removeQueries({
      queryKey: [...codegoKeys.all, "tokens"],
    });
    queryClient.removeQueries({
      queryKey: [...codegoKeys.all, "logs"],
    });
  };

  return useMutation({
    mutationFn: () => codegoApi.logout(),
    onMutate: () => {
      clearCodeGoSessionCache();
    },
    onSuccess: async () => {
      clearCodeGoSessionCache();
      await queryClient.invalidateQueries({ queryKey: codegoKeys.auth() });
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
      await queryClient.invalidateQueries({ queryKey: codegoKeys.groups() });
      await queryClient.invalidateQueries({
        queryKey: codegoKeys.groupStatus(),
      });
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
      await queryClient.invalidateQueries({ queryKey: codegoKeys.groups() });
      await queryClient.invalidateQueries({
        queryKey: codegoKeys.groupStatus(),
      });
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
