import { ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CodeGoAuthState } from "@/lib/api/codego";

interface CodeGoSecureStorageNoticeProps {
  status?: CodeGoAuthState["secureStorageStatus"];
  message?: string;
}

export function CodeGoSecureStorageNotice({
  status,
  message,
}: CodeGoSecureStorageNoticeProps) {
  if (!message || !status || status === "protected") {
    return null;
  }

  return (
    <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-800 [&>svg]:text-amber-700">
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>Secure storage unavailable</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
