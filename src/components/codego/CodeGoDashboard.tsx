import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { codegoApi, settingsApi } from "@/lib/api";
import { copySensitiveText } from "@/lib/clipboard";
import {
  useCodeGoAuthQuery,
  useCodeGoPollAuthSessionMutation,
  useCodeGoLogoutMutation,
  useCodeGoStartAuthSessionMutation,
  useCodeGoSummaryQuery,
} from "@/lib/query";
import { useSettingsQuery } from "@/lib/query/queries";
import { extractErrorMessage } from "@/utils/errorUtils";
import { CodeGoAuthenticatedOverview } from "./CodeGoAuthenticatedOverview";
import { CodeGoDesktopAuthView } from "./CodeGoDesktopAuthView";
import { CodeGoMark } from "./CodeGoMark";

interface CodeGoDashboardProps {
  onOpenSettings: () => void;
  onOpenProviders: () => void;
}

export function CodeGoDashboard({
  onOpenSettings,
  onOpenProviders,
}: CodeGoDashboardProps) {
  const authQuery = useCodeGoAuthQuery();
  const startAuthMutation = useCodeGoStartAuthSessionMutation();
  const pollAuthMutation = useCodeGoPollAuthSessionMutation();
  const logoutMutation = useCodeGoLogoutMutation();
  const settingsQuery = useSettingsQuery();
  const isAuthenticated = Boolean(authQuery.data?.authenticated);
  const autoRefreshEnabled =
    settingsQuery.data?.codegoAutoRefreshEnabled ?? true;
  const summaryQuery = useCodeGoSummaryQuery(
    isAuthenticated,
    autoRefreshEnabled,
  );

  const [serverAddress, setServerAddress] = useState(
    authQuery.data?.serverAddress || "https://shu26.cfd",
  );
  const [deviceName, setDeviceName] = useState("codego desktop");
  const [activeTab, setActiveTab] = useState("overview");
  const [isEnsuringToken, setIsEnsuringToken] = useState(false);
  const [authSession, setAuthSession] = useState<{
    sessionId: string;
    userCode: string;
    verificationUri: string;
    expiresIn: number;
    interval: number;
  } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const authTimerRef = useRef<number | null>(null);
  const authExpireRef = useRef<number | null>(null);

  const summary = summaryQuery.data;

  const stopAuthPolling = () => {
    if (authTimerRef.current !== null) {
      window.clearInterval(authTimerRef.current);
      authTimerRef.current = null;
    }
    authExpireRef.current = null;
  };

  useEffect(() => {
    if (authQuery.data?.serverAddress) {
      setServerAddress(authQuery.data.serverAddress);
    }
  }, [authQuery.data?.serverAddress]);

  useEffect(() => {
    return () => {
      stopAuthPolling();
    };
  }, []);

  const usageModels = useMemo(
    () => summary?.usage.available_models?.slice(0, 6) ?? [],
    [summary?.usage.available_models],
  );

  const handleOpenAuthorizationUrl = async (url: string) => {
    try {
      await settingsApi.openExternal(url);
      setAuthError(null);
    } catch (error) {
      setAuthError(
        extractErrorMessage(error) ||
          "Failed to open browser for authorization",
      );
    }
  };

  const handleStartAuth = async () => {
    try {
      stopAuthPolling();
      setAuthError(null);
      const session = await startAuthMutation.mutateAsync({
        serverAddress,
        deviceName,
      });
      setAuthSession(session);

      try {
        await navigator.clipboard.writeText(session.userCode);
      } catch {}

      await handleOpenAuthorizationUrl(session.verificationUri);

      const expiresAt = Date.now() + session.expiresIn * 1000;
      authExpireRef.current = expiresAt;

      const pollOnce = async () => {
        if (!authExpireRef.current || Date.now() >= authExpireRef.current) {
          stopAuthPolling();
          setAuthError("Authorization session expired. Start again.");
          return;
        }
        try {
          const result = await pollAuthMutation.mutateAsync({
            serverAddress,
            sessionId: session.sessionId,
          });
          if (result.authenticated) {
            stopAuthPolling();
            setAuthSession(null);
            setAuthError(null);
            toast.success("codego account connected", { closeButton: true });
            return;
          }

          if (result.status === "rejected") {
            stopAuthPolling();
            setAuthSession(null);
            setAuthError(
              "Authorization was rejected from the website. Start again.",
            );
            return;
          }

          if (result.status === "expired") {
            stopAuthPolling();
            setAuthSession(null);
            setAuthError("Authorization session expired. Start again.");
          }
        } catch (error) {
          const message =
            extractErrorMessage(error) ||
            "Failed to verify desktop authorization";
          if (!message.toLowerCase().includes("pending")) {
            stopAuthPolling();
            setAuthError(message);
          }
        }
      };

      void pollOnce();
      authTimerRef.current = window.setInterval(
        () => void pollOnce(),
        Math.max(session.interval, 3) * 1000,
      );
    } catch (error) {
      setAuthError(
        extractErrorMessage(error) || "Failed to start codego authorization",
      );
    }
  };

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      toast.success("codego account disconnected", { closeButton: true });
    } catch (error) {
      toast.error(
        extractErrorMessage(error) || "Failed to disconnect codego account",
      );
    }
  };

  const ensureDesktopToken = async () => {
    setIsEnsuringToken(true);
    try {
      const result = await codegoApi.ensureToken("Desktop");
      await summaryQuery.refetch();
      return result;
    } finally {
      setIsEnsuringToken(false);
    }
  };

  const handleCopyToken = async () => {
    try {
      const result = await ensureDesktopToken();
      await copySensitiveText(result.full_key);
      toast.success("Desktop token copied", { closeButton: true });
    } catch (error) {
      toast.error(extractErrorMessage(error) || "Failed to copy token");
    }
  };

  const handleOpenTopUp = async () => {
    if (!summary?.actions?.topup_link) return;
    try {
      await settingsApi.openExternal(summary.actions.topup_link);
    } catch (error) {
      toast.error(extractErrorMessage(error) || "Failed to open top-up page");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 px-6 pb-8">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5">
          <div className="flex items-center gap-3 pt-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-white/70 bg-white/75 shadow-sm">
              <CodeGoMark size={30} className="h-7 w-7" />
            </div>
            <div>
              <div className="codego-kicker">codego desktop</div>
              <div className="text-base font-semibold text-foreground">
                Browser approval and local tool control
              </div>
            </div>
          </div>
          <CodeGoDesktopAuthView
            serverAddress={serverAddress}
            deviceName={deviceName}
            secureStorageStatus={authQuery.data?.secureStorageStatus}
            secureStorageMessage={authQuery.data?.secureStorageMessage}
            authError={authError}
            authQueryError={extractErrorMessage(authQuery.error)}
            authSession={authSession}
            startPending={startAuthMutation.isPending}
            pollPending={pollAuthMutation.isPending}
            onServerAddressChange={setServerAddress}
            onDeviceNameChange={setDeviceName}
            onStartAuth={() => void handleStartAuth()}
            onOpenSettings={onOpenSettings}
            onOpenExternal={(url) => void handleOpenAuthorizationUrl(url)}
            onCancelSession={() => {
              stopAuthPolling();
              setAuthSession(null);
              setAuthError(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 px-6 pb-8">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5">
        <CodeGoAuthenticatedOverview
          activeTab={activeTab}
          summary={summary}
          authState={authQuery.data}
          usageModels={usageModels}
          isAuthenticated={isAuthenticated}
          summaryIsFetching={summaryQuery.isFetching}
          logoutPending={logoutMutation.isPending}
          isEnsuringToken={isEnsuringToken}
          onActiveTabChange={setActiveTab}
          onRefresh={() => void summaryQuery.refetch()}
          onOpenProviders={onOpenProviders}
          onLogout={() => void handleLogout()}
          onCopyToken={() => void handleCopyToken()}
          onEnsureToken={() => void ensureDesktopToken()}
          onOpenTopUp={handleOpenTopUp}
        />
      </div>
    </div>
  );
}
