"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { AuthSessionSummary, ImportJobSummary, WorkspaceSummary } from "@/lib/api";
import { fetchAuthSession, fetchImports, fetchWorkspaceSummary } from "@/lib/api";

import styles from "./admin.module.css";

type ActivityItem = {
  id: string;
  tone: "secondary" | "primary" | "neutral";
  title: string;
  detail: string;
  timestamp: string;
};

type ManagedTreeRow = {
  id: string;
  name: string;
  detail: string;
  owner: string;
  updatedLabel: string;
  accent: "secondary" | "primary" | "tertiary";
  icon: "forest" | "tree" | "scroll";
  href: string;
};

export function AdminDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSessionSummary | null>(null);
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [imports, setImports] = useState<ImportJobSummary[]>([]);
  const [statusMessage, setStatusMessage] = useState("Checking curator access.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        setStatusMessage("Checking curator access.");
        const authSession = await fetchAuthSession();
        if (cancelled) {
          return;
        }

        if (!authSession) {
          setStatusMessage("Redirecting to sign in.");
          router.replace("/login");
          return;
        }

        setSession(authSession);
        setStatusMessage(`Loading curator overview for ${authSession.user.displayName}.`);

        const [workspaceSummary, importJobs] = await Promise.all([
          fetchWorkspaceSummary(),
          fetchImports(),
        ]);

        if (cancelled) {
          return;
        }

        setSummary(workspaceSummary);
        setImports(importJobs);
        setStatusMessage(`Workspace ${workspaceSummary.graphVersion} is ready for review.`);
        setErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to load the curator overview.",
          );
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const hasLoadedMetrics = summary !== null || imports.length > 0;
  const pendingImports = imports.filter((job) => job.status === "pending").length;
  const completedImports = imports.filter((job) => job.status === "completed").length;
  const totalLineages = summary?.peopleCount ?? 12_482;
  const pendingValidation = hasLoadedMetrics ? pendingImports : 142;
  const activeCurators = session ? 1 : 89;

  const profileName = session?.user.displayName ?? "Julian Sterling";
  const profileRole = session ? `${formatRoleLabel(session.user.role)} Archivist` : "Senior Archivist";

  const managedTrees = buildManagedTreeRows({
    session,
    summary,
    imports,
  });
  const activityItems = buildActivityItems({ session, summary, imports });

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand}>
          <p className={styles.sidebarTitle}>The Archive</p>
          <p className={styles.sidebarSubtitle}>Family Registry</p>
        </div>

        <nav className={styles.sidebarNav}>
          <Link href="/admin" className={`${styles.sidebarLink} ${styles.sidebarLinkActive}`}>
            <DashboardIcon />
            <span>Dashboard</span>
          </Link>
          <Link href="/" className={styles.sidebarLink}>
            <TreeIcon />
            <span>Family Tree</span>
          </Link>
          <Link href="/admin/imports" className={styles.sidebarLink}>
            <ArchiveIcon />
            <span>Archives</span>
          </Link>
          <button type="button" className={styles.sidebarButton}>
            <ReportIcon />
            <span>Reports</span>
          </button>
        </nav>

        <div className={styles.sidebarFooter}>
          <Link href="/admin/records/new" className={styles.sidebarPrimaryButton}>
            <AddIcon />
            <span>Add New Record</span>
          </Link>
          <button type="button" className={styles.sidebarHelp}>
            <HelpIcon />
            <span>Help Center</span>
          </button>
        </div>
      </aside>

      <section className={styles.canvas}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <p className={styles.headerEyebrow}>Curator Workspace</p>
            <h1 className={styles.headerTitle}>Administrative Overview</h1>
          </div>

          <div className={styles.profile}>
            <div className={styles.profileCopy}>
              <p className={styles.profileName}>{profileName}</p>
              <p className={styles.profileRole}>{profileRole}</p>
            </div>
            <div className={styles.profileAvatar}>{buildInitials(profileName)}</div>
          </div>
        </header>

        <div className={styles.noticeRow}>
          <div className={styles.noticeBadge}>{statusMessage}</div>
          {errorMessage ? <div className={styles.errorBadge}>{errorMessage}</div> : null}
        </div>

        <section className={styles.statGrid}>
          <article className={`${styles.statCard} ${styles.statCardSurface}`}>
            <div className={styles.statContent}>
              <p className={styles.statLabel}>Total Lineages</p>
              <h2 className={styles.statValue}>{formatCount(totalLineages)}</h2>
              <div className={styles.statTrend}>
                <TrendingUpIcon />
                <span>
                  {summary
                    ? `${formatCount(summary.relationshipCount)} relationships mapped`
                    : "+14% this month"}
                </span>
              </div>
            </div>
            <div className={styles.statGlyph} aria-hidden="true">
              <TreeIcon />
            </div>
          </article>

          <article className={`${styles.statCard} ${styles.statCardPrimary}`}>
            <div className={styles.statContent}>
              <p className={styles.statLabelInverse}>Pending Validation</p>
              <h2 className={styles.statValueInverse}>{formatCount(pendingValidation)}</h2>
              <Link href="/admin/imports" className={styles.statLink}>
                Review Requests
              </Link>
            </div>
          </article>

          <article className={`${styles.statCard} ${styles.statCardSecondary}`}>
            <div className={styles.statContent}>
              <p className={styles.statLabelSoft}>Active Curators</p>
              <h2 className={styles.statValueSoft}>{formatCount(activeCurators)}</h2>
              <div className={styles.curatorRow}>
                <span className={styles.curatorChip}>AC</span>
                <span className={styles.curatorChip}>JS</span>
                <span className={styles.curatorChip}>MH</span>
                <span className={styles.curatorChipCount}>+{Math.max(completedImports, 1)}</span>
              </div>
            </div>
          </article>
        </section>

        <div className={styles.mainGrid}>
          <section className={styles.registrySection}>
            <div className={styles.sectionTop}>
              <h3 className={styles.sectionHeading}>Managed Family Trees</h3>
              <div className={styles.sectionTools}>
                <button type="button" className={styles.toolButton} aria-label="Filter registries">
                  <FilterIcon />
                </button>
                <button type="button" className={styles.toolButton} aria-label="Search registries">
                  <SearchIcon />
                </button>
              </div>
            </div>

            <div className={styles.tableShell}>
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Tree Name</th>
                      <th>Owner</th>
                      <th>Last Updated</th>
                      <th className={styles.alignRight}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managedTrees.map((tree) => (
                      <tr key={tree.id}>
                        <td>
                          <div className={styles.treeMeta}>
                            <div className={`${styles.treeIcon} ${styles[`tree${capitalize(tree.accent)}`]}`}>
                              {renderTreeGlyph(tree.icon)}
                            </div>
                            <div>
                              <p className={styles.treeName}>{tree.name}</p>
                              <p className={styles.treeDetail}>{tree.detail}</p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={styles.ownerMeta}>
                            <span className={styles.ownerAvatar}>{buildInitials(tree.owner)}</span>
                            <span className={styles.ownerName}>{tree.owner}</span>
                          </div>
                        </td>
                        <td className={styles.treeUpdated}>{tree.updatedLabel}</td>
                        <td className={styles.alignRight}>
                          <Link href={tree.href} className={styles.manageButton}>
                            Manage
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.tableFooter}>
                <Link href="/admin/imports" className={styles.footerLink}>
                  View All Registries
                </Link>
              </div>
            </div>
          </section>

          <aside className={styles.activityCard}>
            <div className={styles.activityTop}>
              <h3 className={styles.activityHeading}>Recent Activity</h3>
              <button type="button" className={styles.moreButton} aria-label="More activity options">
                <MoreIcon />
              </button>
            </div>

            <div className={styles.timeline}>
              {activityItems.map((item) => (
                <article key={item.id} className={styles.timelineRow}>
                  <div className={`${styles.timelineBadge} ${styles[`timeline${capitalize(item.tone)}`]}`}>
                    <DotIcon />
                  </div>
                  <div className={styles.timelineText}>
                    <p className={styles.timelineCopy}>
                      <strong>{item.title}</strong> {item.detail}
                    </p>
                    <p className={styles.timelineTimestamp}>{item.timestamp}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className={styles.alertPanel}>
              <div className={styles.alertGlyph}>
                <WarningIcon />
              </div>
              <div>
                <p className={styles.alertTitle}>System Alert</p>
                <p className={styles.alertBody}>
                  {pendingImports > 0
                    ? `${pendingImports} import review${pendingImports > 1 ? "s" : ""} still need curator approval.`
                    : '3 merge conflicts detected in "Windermere"'}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <div className={styles.mobileFab}>
        <Link href="/admin/records/new" className={styles.mobileFabButton} aria-label="Add new record">
          <AddIcon />
        </Link>
      </div>
    </main>
  );
}

function buildManagedTreeRows({
  session,
  summary,
  imports,
}: {
  session: AuthSessionSummary | null;
  summary: WorkspaceSummary | null;
  imports: ImportJobSummary[];
}): ManagedTreeRow[] {
  const ownerName = session?.user.displayName ?? "Julian Sterling";
  const rows: ManagedTreeRow[] = [
    {
      id: "workspace-current",
      name: "Pilot Family Workspace",
      detail: summary
        ? `${formatCount(summary.peopleCount)} members`
        : "2,402 Members",
      owner: ownerName,
      updatedLabel: imports[0]?.updatedAt ? formatRelativeTime(imports[0].updatedAt) : "2 hours ago",
      accent: "secondary",
      icon: "forest",
      href: "/",
    },
  ];

  imports.slice(0, 2).forEach((job, index) => {
    rows.push({
      id: job.importId,
      name: toDisplayTitle(stripExtension(job.filename)),
      detail: `${formatCount(Math.max(job.peopleCount, 1))} members`,
      owner: ownerName,
      updatedLabel: formatRelativeTime(job.updatedAt ?? job.createdAt),
      accent: index === 0 ? "primary" : "tertiary",
      icon: index === 0 ? "tree" : "scroll",
      href: "/admin/imports",
    });
  });

  const fallbackRows: ManagedTreeRow[] = [
    {
      id: "fallback-sloane",
      name: "Sloane-Hart Registry",
      detail: "891 Members",
      owner: "Marcus V.",
      updatedLabel: "Yesterday",
      accent: "primary",
      icon: "tree",
      href: "/admin/imports",
    },
    {
      id: "fallback-windermere",
      name: "The Windermere Scrolls",
      detail: "4,112 Members",
      owner: "Sarah Jenkins",
      updatedLabel: "Oct 12, 2023",
      accent: "tertiary",
      icon: "scroll",
      href: "/admin/imports",
    },
  ];

  for (const row of fallbackRows) {
    if (rows.length >= 3) {
      break;
    }
    rows.push(row);
  }

  return rows.slice(0, 3);
}

function buildActivityItems({
  session,
  summary,
  imports,
}: {
  session: AuthSessionSummary | null;
  summary: WorkspaceSummary | null;
  imports: ImportJobSummary[];
}): ActivityItem[] {
  const items: ActivityItem[] = [];
  const latestImport = imports[0];

  if (latestImport) {
    items.push({
      id: `link-${latestImport.importId}`,
      tone: "secondary",
      title: "Record Linked",
      detail: `for the ${toDisplayTitle(stripExtension(latestImport.filename))} branch.`,
      timestamp: formatRelativeTime(latestImport.updatedAt ?? latestImport.createdAt),
    });
  } else {
    items.push({
      id: "link-fallback",
      tone: "secondary",
      title: "Record Linked",
      detail: 'for the Sloane branch.',
      timestamp: "12 mins ago",
    });
  }

  items.push({
    id: "backup",
    tone: "primary",
    title: "System Backup",
    detail: summary
      ? `completed for workspace ${summary.graphVersion}.`
      : "completed for Global Archive #04.",
    timestamp: summary ? "Current session" : "2 hours ago",
  });

  items.push({
    id: "upload",
    tone: "neutral",
    title: session?.user.displayName ?? "Marcus V.",
    detail: latestImport
      ? `uploaded ${formatCount(Math.max(latestImport.peopleCount, 4))} historical records.`
      : "uploaded 4 historical census records.",
    timestamp: latestImport ? formatRelativeTime(latestImport.createdAt) : "5 hours ago",
  });

  items.push({
    id: "curator",
    tone: "neutral",
    title: "New Curator",
    detail: "application received from Oxford Univ.",
    timestamp: "Yesterday",
  });

  return items.slice(0, 4);
}

function stripExtension(filename: string) {
  return filename.replace(/\.[^.]+$/, "");
}

function toDisplayTitle(value: string) {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatRoleLabel(role?: string) {
  if (!role) {
    return "Senior";
  }

  const normalized = role.charAt(0).toUpperCase() + role.slice(1);
  return normalized === "Owner" ? "Senior" : normalized;
}

function formatRelativeTime(value: string | null | undefined) {
  if (!value) {
    return "Recently";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "Recently";
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes < 1) {
    return "Just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} mins ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function buildInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function renderTreeGlyph(icon: ManagedTreeRow["icon"]) {
  switch (icon) {
    case "forest":
      return <ForestIcon />;
    case "scroll":
      return <ScrollIcon />;
    default:
      return <TreeIcon />;
  }
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="4.5" rx="1.6" />
      <rect x="14" y="10.5" width="7" height="10.5" rx="1.6" />
      <rect x="3" y="13.5" width="7" height="7.5" rx="1.6" />
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20v-6" />
      <path d="M8 14c-2 0-3.5-1.4-3.5-3.2 0-1.7 1.2-2.7 2.4-3.4C7.4 5.5 9.1 4 12 4s4.6 1.5 5.1 3.4c1.3.7 2.4 1.7 2.4 3.4C19.5 12.6 18 14 16 14H8Z" />
      <path d="M10 20h4" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7.5h16" />
      <path d="M5.5 7.5h13v10A2.5 2.5 0 0 1 16 20H8a2.5 2.5 0 0 1-2.5-2.5v-10Z" />
      <path d="M8 4h8a1.5 1.5 0 0 1 1.5 1.5v2H6.5v-2A1.5 1.5 0 0 1 8 4Z" />
      <path d="M10 12h4" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 19h12" />
      <path d="M8 16v-5" />
      <path d="M12 16V8" />
      <path d="M16 16v-8" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.8 2.8 0 1 1 4.8 2c-.6.6-1.3 1-1.8 1.6-.4.4-.5.8-.5 1.5" />
      <circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TrendingUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m4 15 5-5 4 4 7-7" />
      <path d="M15 7h5v5" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="6" />
      <path d="m19 19-3.5-3.5" />
    </svg>
  );
}

function ForestIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 20v-4" />
      <path d="M17 20v-5" />
      <path d="M5 16h4L7 5l-2 6H3l4 5Z" />
      <path d="M14 15h6l-3-9-3 9Z" />
    </svg>
  );
}

function ScrollIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 4h8a3 3 0 0 1 3 3v9a4 4 0 0 1-4 4H9a3 3 0 0 1 0-6h7" />
      <path d="M8 4a3 3 0 0 0-3 3v9a4 4 0 0 0 4 4" />
      <path d="M10 8h6" />
      <path d="M10 12h5" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 4 4 19h16L12 4Z" />
      <path d="M12 9v4.5" />
      <circle cx="12" cy="16.8" r=".8" fill="currentColor" stroke="none" />
    </svg>
  );
}
