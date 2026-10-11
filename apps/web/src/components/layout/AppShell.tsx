/**
 * AppShell — client-side shell that composes Sidebar + TopBar + main area.
 *
 * Sidebar is 280 px wide on desktop (or 60 px when collapsed).
 * The main content area shifts via a CSS variable --sidebar-w that the
 * Sidebar updates through a data attribute on <body>.
 * On mobile the sidebar is a full-height drawer (zero width impact on layout).
 */
"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { PageTransition } from "./PageTransition";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const sidebarWidth = sidebarCollapsed ? "60px" : "280px";

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />

      {/* Main area — offset by sidebar width on md+ */}
      <div
        className="flex min-w-0 flex-1 flex-col transition-[padding] duration-200 md:pl-[var(--sidebar-w)]"
        style={{ ["--sidebar-w" as string]: sidebarWidth }}
      >
        <TopBar onMenuClick={() => setMobileOpen(true)} />

        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
        >
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
