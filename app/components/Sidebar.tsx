"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, CalendarDays, Sparkles, FolderOpen,
  ClipboardCheck, ChevronsLeft, ChevronsRight, GraduationCap, Users, LogOut,
  ClipboardList, Clock, Layers, ChartLine, Target,
} from "lucide-react";
import { authClient } from "../../lib/auth-client";

type SidebarProps = {
  userName: string;
  roleLabel?: string;
  organizationName: string;
  primaryColor: string;
  accentColor: string;
  microAnalyseLabel: string;
  canManageGroups?: boolean;
  canViewOverview?: boolean;
  canUseQuality?: boolean;
  canViewQualityOverview?: boolean;
  canViewQualityGoals?: boolean;
  /** Mijn Week in het menu; het bestuur heeft geen eigen groepen. */
  canUseMijnWeek?: boolean;
};

export default function Sidebar({ userName, roleLabel, organizationName, primaryColor, accentColor, microAnalyseLabel, canManageGroups = false, canViewOverview = false, canUseQuality = false, canViewQualityOverview = false, canViewQualityGoals = false, canUseMijnWeek = true }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ...(canUseMijnWeek ? [{ href: "/mijn-week", label: "Mijn Week", icon: CalendarDays }] : []),
    { href: "/lesassistent", label: "Lesassistent", icon: Sparkles },
    { href: "/materiaal", label: "Materiaal", icon: FolderOpen },
    ...(canViewOverview ? [{ href: "/weekplannen", label: "Weekplannen", icon: ClipboardList }] : []),
    ...(canManageGroups
      ? [
          { href: "/groepen", label: "Groepen", icon: Users },
          { href: "/schoolrooster", label: "Schoolrooster", icon: Clock },
        ]
      : []),
  ];

  // Kwaliteitscyclus: weekplan -> groepsreflectie -> clusterplan -> IB-overzicht -> kwaliteitsdoelen (PDCA).
  const qualityItems = [
    ...(canUseQuality
      ? [
          { href: "/micro-analyse", label: microAnalyseLabel, icon: ClipboardCheck },
          { href: "/clusterplannen", label: "Clusterplannen", icon: Layers },
        ]
      : []),
    ...(canViewQualityOverview ? [{ href: "/ib-overzicht", label: "IB-overzicht", icon: ChartLine }] : []),
    ...(canViewQualityGoals ? [{ href: "/kwaliteitsdoelen", label: "Kwaliteitsdoelen", icon: Target }] : []),
  ];

  return (
    <aside className={`flex flex-col justify-between shrink-0 transition-all duration-300 print:hidden ${collapsed ? "w-20" : "w-72"}`} style={{ background: primaryColor }}>
      <div>
        <div className="flex items-center gap-3 px-5 pt-6 pb-8">
          <div className="relative w-18 h-18 shrink-0">
            <Image src="/logo/klasmaatje-icon-white.png" alt="Klasmaatje" fill sizes="72px" className="object-contain" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-white font-semibold text-base leading-tight">Klasmaatje</p>
              <p className="text-xs leading-tight" style={{ color: "#C8B6E8" }}>{organizationName}</p>
            </div>
          )}
        </div>

        <nav className="px-3">
          <ul className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname?.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href}
                    className={`flex items-center gap-3 rounded-lg py-2.5 ${collapsed ? "px-2 justify-center" : "px-3"}`}
                    style={{ background: isActive ? "rgba(232,180,74,0.14)" : "transparent", color: isActive ? accentColor : "#E4DAF5" }}
                    title={item.label}>
                    <Icon size={18} strokeWidth={2} className="shrink-0" />
                    {!collapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>

          {qualityItems.length > 0 && (<>
          <div className="mt-5 mb-2">
            {collapsed ? (
              <div className="h-px mx-2" style={{ background: "rgba(255,255,255,0.12)" }} />
            ) : (
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#C8B6E8" }}>Kwaliteitscyclus</p>
            )}
          </div>
          <ul className="flex flex-col gap-1" aria-label="Kwaliteitscyclus">
            {qualityItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname?.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href}
                    className={`flex items-center gap-3 rounded-lg py-2.5 ${collapsed ? "px-2 justify-center" : "px-3"}`}
                    style={{ background: isActive ? "rgba(232,180,74,0.14)" : "transparent", color: isActive ? accentColor : "#E4DAF5" }}
                    title={item.label}>
                    <Icon size={18} strokeWidth={2} className="shrink-0" />
                    {!collapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
          </>)}
        </nav>
      </div>

      <div className="px-3 pb-4">
        <div className="h-px w-full mb-3" style={{ background: "rgba(255,255,255,0.12)" }} />
        <div className={`flex items-center gap-3 rounded-lg px-2 py-2 mb-2 ${collapsed ? "justify-center" : ""}`}>
          <div className="flex items-center justify-center w-9 h-9 rounded-full shrink-0" style={{ background: "rgba(255,255,255,0.1)" }}>
            <GraduationCap size={16} color={accentColor} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{userName}</p>
              {roleLabel && <p className="text-xs truncate" style={{ color: "#C8B6E8" }}>{roleLabel}</p>}
            </div>
          )}
        </div>

        <button onClick={handleSignOut} disabled={signingOut}
          className={`flex items-center gap-2 rounded-lg py-2 w-full text-xs font-medium disabled:opacity-60 ${collapsed ? "justify-center px-2" : "px-3"}`}
          style={{ color: "#C8B6E8" }}
          title="Uitloggen">
          <LogOut size={16} />
          {!collapsed && <span>{signingOut ? "Bezig..." : "Uitloggen"}</span>}
        </button>

        <button onClick={() => setCollapsed(!collapsed)}
          className={`flex items-center gap-2 rounded-lg py-2 w-full text-xs font-medium ${collapsed ? "justify-center px-2" : "px-3"}`}
          style={{ color: "#C8B6E8" }}>
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          {!collapsed && <span>Inklappen</span>}
        </button>
      </div>
    </aside>
  );
}
