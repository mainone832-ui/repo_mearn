"use client";

import { Avatar, Chip } from "@heroui/react";

type NavbarProps = {
  title: string;
  subtitle?: string;
};

export default function Navbar({ title, subtitle }: NavbarProps) {
  return (
    <header className="surface-card mb-5 flex flex-col gap-4 p-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Operations
        </p>
        <h1 className="text-xl font-semibold text-[var(--text-main)] sm:text-2xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <Chip
          color="primary"
          variant="flat"
          size="sm"
          className="border border-blue-100 bg-[var(--accent-soft)] px-3 text-[var(--accent)]"
        >
          Admin Panel
        </Chip>
        <Avatar
          name="Admin"
          size="sm"
          classNames={{
            base: "bg-[var(--accent-soft)] text-[var(--accent)]",
            name: "text-[var(--accent)]",
          }}
        />
      </div>
    </header>
  );
}
