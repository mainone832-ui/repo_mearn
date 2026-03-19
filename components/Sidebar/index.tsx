"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type IconProps = {
  className?: string;
};

const DashboardIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      d="M4 13h7V4H4v9Zm0 7h7v-5H4v5Zm9 0h7v-9h-7v9Zm0-11h7V4h-7v5Z"
    />
  </svg>
);

const DevicesIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <rect x="7" y="2.5" width="10" height="19" rx="2" strokeWidth="1.8" />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      d="M10 5h4M11 18h2"
    />
  </svg>
);

const FormsIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z"
    />
  </svg>
);

const SettingsIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      d="M10.3 2.9a1 1 0 0 1 1.4-.2l.8.6a1 1 0 0 0 1.2 0l.8-.6a1 1 0 0 1 1.4.2l1.2 1.7a1 1 0 0 0 1 .4l1-.1a1 1 0 0 1 1.1.9l.3 2a1 1 0 0 0 .7.8l.9.3a1 1 0 0 1 .7 1.2l-.5 1.9a1 1 0 0 0 .3 1l.7.6a1 1 0 0 1 .1 1.4l-1.3 1.6a1 1 0 0 0-.2 1.1l.4.9a1 1 0 0 1-.5 1.3l-1.8.9a1 1 0 0 0-.5.9v1a1 1 0 0 1-1 .9l-2-.1a1 1 0 0 0-1 .6l-.5.8a1 1 0 0 1-1.4.3l-1.7-1.1a1 1 0 0 0-1.1 0l-1.7 1.1a1 1 0 0 1-1.4-.3l-.5-.8a1 1 0 0 0-1-.6l-2 .1a1 1 0 0 1-1-.9v-1a1 1 0 0 0-.5-.9l-1.8-.9a1 1 0 0 1-.5-1.3l.4-.9a1 1 0 0 0-.2-1.1L2.7 15a1 1 0 0 1 .1-1.4l.7-.6a1 1 0 0 0 .3-1L3.3 10a1 1 0 0 1 .7-1.2l.9-.3a1 1 0 0 0 .7-.8l.3-2A1 1 0 0 1 7 4.8l1 .1a1 1 0 0 0 1-.4l1.2-1.6Z"
    />
    <circle cx="12" cy="12" r="3" strokeWidth="1.8" />
  </svg>
);

const NotificationsIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
    />
  </svg>
);

const FavoritesIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
    />
  </svg>
);

const AdminIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    />
  </svg>
);

const CrashesIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

const navigationItems = [
  { label: "Dashboard", href: "/dashboard", Icon: DashboardIcon },
  { label: "Devices", href: "/devices", Icon: DevicesIcon },
  { label: "Forms & Payments", href: "/forms", Icon: FormsIcon },
  { label: "Notifications", href: "/notifications", Icon: NotificationsIcon },
  { label: "Favorites", href: "/favorites", Icon: FavoritesIcon },
  // { label: "Admin Sessions", href: "/admin-sessions", Icon: AdminIcon },
  { label: "Crashes", href: "/crashes", Icon: CrashesIcon },
  { label: "Settings", href: "/settings", Icon: SettingsIcon },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden border-r border-[var(--border)] bg-white/80 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:flex-col">
        <div className="flex h-full flex-col px-5 py-6">
          <div className="surface-card mb-6 rounded-3xl bg-white p-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)] text-sm font-bold text-white">
                M
              </div>
              <div>
                <p className="text-sm font-semibold tracking-wide text-[var(--text-main)]">
                  Monetio Admin
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Remote Mobile Monitoring
                </p>
              </div>
            </div>
            <div className="status-pill status-pill-online w-fit">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              System online
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-1.5">
            {navigationItems.map(({ label, href, Icon }) => {
              const isActive =
                pathname === href || pathname.startsWith(`${href}/`);

              return (
                <Link
                  key={href}
                  href={href}
                  className={`group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all ${
                    isActive
                      ? "bg-[var(--accent)] text-white shadow-[0_14px_30px_rgba(37,99,235,0.24)]"
                      : "text-[var(--text-muted)] hover:bg-white hover:text-[var(--text-main)]"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl transition ${
                      isActive
                        ? "bg-white/18 text-white"
                        : "bg-[var(--surface-subtle)] text-[var(--text-main)] group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="truncate">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <aside className="fixed inset-x-3 bottom-3 z-50 lg:hidden">
        <nav className="flex gap-1 overflow-x-auto rounded-[28px] border border-white/70 bg-white/92 p-2 shadow-[0_18px_40px_rgba(15,23,42,0.18)] backdrop-blur-xl">
          {navigationItems.map(({ label, href, Icon }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                className={`flex min-h-[64px] min-w-[72px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold transition ${
                  isActive
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-muted)]"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate">{label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
