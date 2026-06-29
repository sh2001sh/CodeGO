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
import {
  Laptop,
  Loader2,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "./codegoShared";

interface CodeGoAuthorizedDevicesCardProps {
  enabled: boolean;
  currentDeviceId?: number;
}

function isDeviceActive(device: CodeGoAuthorizedDevice) {
  return (
    device.revokedAt <= 0 && device.status.trim().toLowerCase() === "active"
  );
}

function deviceAccessLabel(device: CodeGoAuthorizedDevice) {
  if (device.revokedAt > 0) {
    return "revoked";
  }
  const normalizedStatus = device.status.trim().toLowerCase();
  return normalizedStatus || "active";
}

function deviceStatusTone(device: CodeGoAuthorizedDevice, isCurrent: boolean) {
  if (!isDeviceActive(device)) {
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
  const { t } = useTranslation();
  const devicesQuery = useCodeGoAuthorizedDevicesQuery(enabled);
  const revokeDeviceMutation = useCodeGoRevokeAuthorizedDeviceMutation();
  const [pendingDevice, setPendingDevice] =
    useState<CodeGoAuthorizedDevice | null>(null);

  const devices = useMemo(
    () => sortDevices(devicesQuery.data ?? [], currentDeviceId),
    [currentDeviceId, devicesQuery.data],
  );
  const activeCount = useMemo(
    () => devices.filter((device) => isDeviceActive(device)).length,
    [devices],
  );

  const handleRevoke = async () => {
    if (!pendingDevice || !isDeviceActive(pendingDevice)) return;
    const isCurrent = pendingDevice.id === currentDeviceId;

    try {
      await revokeDeviceMutation.mutateAsync(pendingDevice.id);
      toast.success(
        isCurrent
          ? t(
              "codego.devices.currentRevoked",
              "Current device access revoked",
            )
          : t("codego.devices.deviceRevoked", {
              name: pendingDevice.deviceName,
              defaultValue: "{{name}} access revoked",
            }),
        { closeButton: true },
      );
      setPendingDevice(null);
    } catch (error) {
      toast.error(
        extractErrorMessage(error) ||
          t(
            "codego.devices.revokeFailed",
            "Failed to revoke device access",
          ),
      );
    }
  };

  return (
    <>
      <Card className="border-border/70 bg-card/90">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {t("codego.devices.title", "Authorized devices")}
            </CardTitle>
          </div>
          <Badge variant="outline">
            {t("codego.devices.activeCount", {
              count: activeCount,
              defaultValue: `${activeCount} active`,
            })}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {devicesQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("codego.devices.loading", "Loading device access")}
            </div>
          ) : null}

          {devicesQuery.error ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
              {extractErrorMessage(devicesQuery.error) ||
                t(
                  "codego.devices.loadFailed",
                  "Failed to load device access",
                )}
            </div>
          ) : null}

          {!devicesQuery.isLoading &&
          !devicesQuery.error &&
          devices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
              {t(
                "codego.devices.empty",
                "No authorized devices found for this account.",
              )}
            </div>
          ) : null}

          {devices.length > 0 ? (
            <div className="space-y-3">
              {devices.map((device) => {
                const isCurrent = device.id === currentDeviceId;
                const Icon = platformIcon(device.platform);
                const isPending =
                  revokeDeviceMutation.isPending &&
                  pendingDevice?.id === device.id;
                const canRevoke = isDeviceActive(device);

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
                            {isCurrent
                              ? t(
                                  "codego.devices.currentDevice",
                                  "Current device",
                                )
                              : device.status || "active"}
                          </Badge>
                          {device.revokedAt > 0 ? (
                            <Badge variant="destructive">
                              {t("codego.devices.revoked", "Revoked")}
                            </Badge>
                          ) : null}
                        </div>

                        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                          <div>
                            {t("codego.devices.platform", "Platform")}:{" "}
                            {device.platform || "-"}
                          </div>
                          <div>
                            {t("codego.devices.version", "Version")}:{" "}
                            {device.appVersion || "-"}
                          </div>
                          <div>
                            {t("codego.devices.created", "Created")}:{" "}
                            {formatDateTime(device.createdAt)}
                          </div>
                          <div>
                            {t("codego.devices.lastUsed", "Last used")}:{" "}
                            {formatDateTime(device.lastUsedAt)}
                          </div>
                          <div>
                            {t("codego.devices.expires", "Expires")}:{" "}
                            {formatDateTime(device.expiresAt)}
                          </div>
                          <div>
                            {t("codego.devices.access", "Access")}:{" "}
                            {deviceAccessLabel(device)}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant={isCurrent ? "destructive" : "outline"}
                        className="h-9 gap-2"
                        disabled={isPending || !canRevoke}
                        onClick={() => {
                          if (canRevoke) {
                            setPendingDevice(device);
                          }
                        }}
                      >
                        {isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isCurrent ? (
                          <ShieldOff className="h-4 w-4" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                        {isCurrent
                          ? t("codego.devices.revokeCurrent", "Revoke current")
                          : t("codego.devices.revokeAccess", "Revoke access")}
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
            ? t("codego.devices.revokeCurrentTitle", "Revoke current device")
            : t("codego.devices.revokeAccessTitle", "Revoke device access")
        }
        message={
          pendingDevice?.id === currentDeviceId
            ? t("codego.devices.revokeCurrentMessage", {
                name:
                  pendingDevice?.deviceName ||
                  t("codego.devices.thisDevice", "this device"),
                defaultValue:
                  "Revoke {{name}} now? This desktop will be disconnected immediately and must be authorized again before it can use codego.",
              })
            : t("codego.devices.revokeAccessMessage", {
                name:
                  pendingDevice?.deviceName ||
                  t("codego.devices.thisDevice", "this device"),
                defaultValue:
                  "Revoke {{name}}? That desktop will lose access to codego until it is authorized again.",
              })
        }
        confirmText={
          pendingDevice?.id === currentDeviceId
            ? t(
                "codego.devices.revokeCurrentConfirm",
                "Revoke current device",
              )
            : t("codego.devices.revokeAccess", "Revoke access")
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
