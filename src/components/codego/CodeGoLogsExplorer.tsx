import { useMemo, useState } from "react";
import { AlertCircle, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCodeGoUsageLogsQuery } from "@/lib/query";
import type {
  CodeGoUsageLogItem,
  CodeGoUsageLogsQuery,
} from "@/lib/api/codego";
import { formatDateTime } from "./codegoShared";

type LogTypeFilter = "all" | "1" | "2" | "3";

interface CodeGoLogsExplorerProps {
  enabled: boolean;
}

const PAGE_SIZE = 12;

function toTimestamp(value: string, endOfWindow = false) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfWindow) {
    return Math.floor(date.getTime() / 1000) + 86399;
  }
  return Math.floor(date.getTime() / 1000);
}

function typeLabel(type?: number) {
  switch (type) {
    case 1:
      return "Completion";
    case 2:
      return "Embedding";
    case 3:
      return "Moderation";
    default:
      return type ? `Type ${type}` : "Unknown";
  }
}

export function CodeGoLogsExplorer({ enabled }: CodeGoLogsExplorerProps) {
  const [page, setPage] = useState(1);
  const [tokenName, setTokenName] = useState("");
  const [modelName, setModelName] = useState("");
  const [requestId, setRequestId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [typeFilter, setTypeFilter] = useState<LogTypeFilter>("all");
  const [selectedLog, setSelectedLog] = useState<CodeGoUsageLogItem | null>(
    null,
  );

  const query = useMemo<CodeGoUsageLogsQuery>(
    () => ({
      p: page,
      size: PAGE_SIZE,
      token_name: tokenName.trim() || undefined,
      model_name: modelName.trim() || undefined,
      request_id: requestId.trim() || undefined,
      start_timestamp: toTimestamp(startDate),
      end_timestamp: toTimestamp(endDate, true),
      type: typeFilter === "all" ? undefined : Number.parseInt(typeFilter, 10),
    }),
    [endDate, modelName, page, requestId, startDate, tokenName, typeFilter],
  );

  const logsQuery = useCodeGoUsageLogsQuery(query, enabled);
  const logsPage = logsQuery.data;
  const errorMessage =
    logsQuery.error instanceof Error
      ? logsQuery.error.message
      : logsQuery.error
        ? String(logsQuery.error)
        : "";
  const totalPages = useMemo(() => {
    if (!logsPage) return 1;
    return Math.max(1, Math.ceil(logsPage.total / Math.max(logsPage.size, 1)));
  }, [logsPage]);

  const resetFilters = () => {
    setPage(1);
    setTokenName("");
    setModelName("");
    setRequestId("");
    setStartDate("");
    setEndDate("");
    setTypeFilter("all");
  };

  return (
    <>
      <Card className="border-border/70 bg-card/90">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base">Usage logs</CardTitle>
            <p className="text-sm text-muted-foreground">
              Filter by model, token, request, and time range before drilling
              into the individual request record.
            </p>
          </div>
          <Button
            variant="outline"
            className="h-9 gap-2"
            onClick={() => void logsQuery.refetch()}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-2">
              <Label htmlFor="codego-log-model">Model</Label>
              <Input
                id="codego-log-model"
                value={modelName}
                onChange={(event) => {
                  setPage(1);
                  setModelName(event.target.value);
                }}
                placeholder="gpt-5.5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="codego-log-token">Token</Label>
              <Input
                id="codego-log-token"
                value={tokenName}
                onChange={(event) => {
                  setPage(1);
                  setTokenName(event.target.value);
                }}
                placeholder="Desktop token"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="codego-log-request">Request ID</Label>
              <Input
                id="codego-log-request"
                value={requestId}
                onChange={(event) => {
                  setPage(1);
                  setRequestId(event.target.value);
                }}
                placeholder="req_..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="codego-log-start">Start date</Label>
              <Input
                id="codego-log-start"
                type="date"
                value={startDate}
                onChange={(event) => {
                  setPage(1);
                  setStartDate(event.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="codego-log-end">End date</Label>
              <Input
                id="codego-log-end"
                type="date"
                value={endDate}
                onChange={(event) => {
                  setPage(1);
                  setEndDate(event.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="codego-log-type">Type</Label>
              <Select
                value={typeFilter}
                onValueChange={(value: LogTypeFilter) => {
                  setPage(1);
                  setTypeFilter(value);
                }}
              >
                <SelectTrigger id="codego-log-type">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="1">Completion</SelectItem>
                  <SelectItem value="2">Embedding</SelectItem>
                  <SelectItem value="3">Moderation</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {logsPage
                ? `${logsPage.total} matching requests`
                : "Waiting for data"}
            </div>
            <Button variant="outline" className="h-8" onClick={resetFilters}>
              Reset filters
            </Button>
          </div>

          {logsQuery.isError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Failed to load logs</AlertTitle>
              <AlertDescription>
                {errorMessage || "Unable to read usage logs from codego."}
              </AlertDescription>
            </Alert>
          ) : logsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading logs
            </div>
          ) : logsPage?.items?.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Quota</TableHead>
                    <TableHead className="w-[120px] text-right">
                      Detail
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsPage.items.map((item) => (
                    <TableRow key={`${item.id}-${item.created_at}`}>
                      <TableCell>{formatDateTime(item.created_at)}</TableCell>
                      <TableCell>{typeLabel(item.type)}</TableCell>
                      <TableCell>{item.model_name || "-"}</TableCell>
                      <TableCell>{item.token_name || "-"}</TableCell>
                      <TableCell>{item.quota ?? 0}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={() => setSelectedLog(item)}
                          >
                            Inspect
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="h-8"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    className="h-8"
                    disabled={page >= totalPages}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              No requests matched the current filters.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedLog)}
        onOpenChange={(open) => !open && setSelectedLog(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Request detail</DialogTitle>
            <DialogDescription>
              Review the selected request record, including identifiers, token
              usage, and the recorded content summary.
            </DialogDescription>
          </DialogHeader>
          {selectedLog ? (
            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              <div>
                <div className="text-xs text-muted-foreground">Created</div>
                <div className="mt-1 text-sm">
                  {formatDateTime(selectedLog.created_at)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Type</div>
                <div className="mt-1 text-sm">
                  {typeLabel(selectedLog.type)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Model</div>
                <div className="mt-1 text-sm">
                  {selectedLog.model_name || "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Token</div>
                <div className="mt-1 text-sm">
                  {selectedLog.token_name || "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Quota</div>
                <div className="mt-1 text-sm">{selectedLog.quota ?? 0}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Latency</div>
                <div className="mt-1 text-sm">
                  {selectedLog.use_time ? `${selectedLog.use_time} ms` : "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Prompt tokens
                </div>
                <div className="mt-1 text-sm">
                  {selectedLog.prompt_tokens ?? "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Completion tokens
                </div>
                <div className="mt-1 text-sm">
                  {selectedLog.completion_tokens ?? "-"}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs text-muted-foreground">Request ID</div>
                <div className="mt-1 break-all font-mono text-xs">
                  {selectedLog.request_id || "-"}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs text-muted-foreground">
                  Upstream request ID
                </div>
                <div className="mt-1 break-all font-mono text-xs">
                  {selectedLog.upstream_request_id || "-"}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs text-muted-foreground">Content</div>
                <div className="mt-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                  {selectedLog.content || "-"}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedLog(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
