import { ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CodeGoAuthState } from "@/lib/api/codego";
import { useTranslation } from "react-i18next";

interface CodeGoSecureStorageNoticeProps {
  status?: CodeGoAuthState["secureStorageStatus"];
  message?: string;
}

export function CodeGoSecureStorageNotice({
  status,
  message,
}: CodeGoSecureStorageNoticeProps) {
  const { t } = useTranslation();

  if (!message || !status || status === "protected") {
    return null;
  }

  return (
    <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-800 [&>svg]:text-amber-700">
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>
        {t("codego.secureStorage.title", "Secure storage unavailable")}
      </AlertTitle>
      <AlertDescription>
        {status === "unavailable"
          ? t(
              "codego.secureStorage.unavailableBody",
              "Secure credential storage is unavailable on this device. Code Go will temporarily keep the desktop session in local settings until Keychain, Credential Manager, or Secret Service starts working again.",
            )
          : message}
      </AlertDescription>
    </Alert>
  );
}
