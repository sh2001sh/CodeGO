import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { CodeGoAuthorizedDevice } from "@/lib/api/codego";
import {
  useCodeGoAuthorizedDevicesQuery,
  useCodeGoRevokeAuthorizedDeviceMutation,
} from "@/lib/query";
import { extractErrorMessage } from "@/utils/errorUtils";
import { Laptop, Loader2, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "./codegoShared";

interface CodeGoAuthorizedDevicesCardProps {
  enabled: boolean;
  currentDeviceId?: number;
}

function deviceStatusTone(device: CodeGoAuthorizedDevice, isCurrent: boolean) {
  if (device.revokedAt > 0 || device.status.toLowerCase() === "revoked") {
    return "destructive" as const;
  }
  if (isCurrent) {
    return "default" as const;
  }
  return "outline" as const;
}

function platformIcon(platform: string) {
  const value = platform.trim().toLowerCase();
  if (value.includes("ios") || value.includes("android")) {
    return Smartphone;
  }
  return Laptop;
}

function sortDevices(
  devices: CodeGoAuthorizedDevice[],
  currentDeviceId?: number,
) {
  return [...devices].sort((left, right) => {
    const leftCurrent = left.id === currentDeviceId ? 1 : 0;
    const rightCurrent = right.id === currentDeviceId ? 1 : 0;
    if (leftCurrent !== rightCurrent) {
      return rightCurrent - leftCurrent;
    }
    return right.lastUsedAt - left.lastUsedAt;
  });
}

export function CodeGoAuthorizedDevicesCard({
  enabled,
  currentDeviceId,
}: CodeGoAuthorizedDevicesCardProps) {
  const devicesQuery = useCodeGoAuthorizedDevicesQuery(enabled);
  const revokeDeviceMutation = useCodeGoRevokeAuthorizedDeviceMutation();
  const [pendingDevice, setPendingDevice] = useState<CodeGoAuthorizedDevice | null>(null);

  const devices = useMemo(
    () => sortDevices(devicesQuery.data ?? [], currentDeviceId),
    [currentDeviceId, devicesQuery.data],
  );

  const handleRevoke = async () => {
    if (!pendingDevice) return;
    const isCurrent = pendingDevice.id === currentDeviceId;

    try {
      await revokeDeviceMutation.mutateAsync(pendingDevice.id);
      toast.success(
        isCurrent
          ? "Current device access revoked"
          : `${pendingDevice.deviceName} access revoked`,
        { closeButton: true },
      );
      setPendingDevice(null);
    } catch (error) {
      toast.error(
        extractErrorMessage(error) || "Failed to revoke device access",
      );
    }
  };

  return (
    <>
      <Card className="border-border/70 bg-card/90">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Authorized devices</CardTitle>
          </div>
          <Badge variant="outline">{devices.length} active</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {devicesQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading device access
            </div>
          ) : null}

          {devicesQuery.error ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
              {extractErrorMessage(devicesQuery.error) || "Failed to load device access"}
            </div>
          ) : null}

          {!devicesQuery.isLoading && !devicesQuery.error && devices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
              No authorized devices found for this account.
            </div>
          ) : null}

          {devices.length > 0 ? (
            <div className="space-y-3">
              {devices.map((device) => {
                const isCurrent = device.id === currentDeviceId;
                const Icon = platformIcon(device.platform);
                const isPending = revokeDeviceMutation.isPending && pendingDevice?.id === device.id;

                return (
                  <div
                    key={device.id}
                    className="rounded-lg border border-border bg-muted/20 px-4 py-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span>{device.deviceName}</span>
                          </div>
                          <Badge variant={deviceStatusTone(device, isCurrent)}>
                            {isCurrent ? "Current device" : device.status || "active"}
                          </Badge>
                          {device.revokedAt > 0 ? (
                            <Badge variant="destructive">Revoked</Badge>
                          ) : null}
                        </div>

                        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                          <div>Platform: {device.platform || "-"}</div>
                          <div>Version: {device.appVersion || "-"}</div>
                          <div>Created: {formatDateTime(device.createdAt)}</div>
                          <div>Last used: {formatDateTime(device.lastUsedAt)}</div>
                          <div>Expires: {formatDateTime(device.expiresAt)}</div>
                          <div>
                            Access: {device.revokedAt > 0 ? "revoked" : "active"}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant={isCurrent ? "destructive" : "outline"}
                        className="h-9 gap-2"
                        disabled={isPending}
                        onClick={() => setPendingDevice(device)}
                      >
                        {isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isCurrent ? (
                          <ShieldOff className="h-4 w-4" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                        {isCurrent ? "Revoke current" : "Revoke access"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        isOpen={pendingDevice != null}
        title={
          pendingDevice?.id === currentDeviceId
            ? "Revoke current device"
            : "Revoke device access"
        }
        message={
          pendingDevice?.id === currentDeviceId
            ? `Revoke ${pendingDevice?.deviceName || "this device"} now? This desktop will be disconnected immediately and must be authorized again before it can use Code Go.`
            : `Revoke ${pendingDevice?.deviceName || "this device"}? That desktop will lose access to Code Go until it is authorized again.`
        }
        confirmText={
          pendingDevice?.id === currentDeviceId ? "Revoke current device" : "Revoke access"
        }
        onConfirm={() => void handleRevoke()}
        onCancel={() => {
          if (!revokeDeviceMutation.isPending) {
            setPendingDevice(null);
          }
        }}
      />
    </>
  );
}
