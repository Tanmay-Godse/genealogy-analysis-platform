"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import type {
  GraphChunk,
  KinshipResult,
  PersonSummary,
  SceneMode,
  SearchResult,
  ViewerRole,
  WorkspaceSummary,
} from "@/lib/api";
import {
  fetchAuthSession,
  fetchKinship,
  fetchLineage,
  fetchPerson,
  fetchSubgraph,
  fetchWorkspaceScene,
  fetchWorkspaceSummary,
  searchPeople,
} from "@/lib/api";

import styles from "./home.module.css";

const CanonicalGenealogyScene = dynamic(
  () =>
    import("@/components/scene/canonical-genealogy-scene").then(
      (module) => module.CanonicalGenealogyScene,
    ),
  {
    ssr: false,
    loading: () => <div className={styles.sceneFallback}>Rendering the genealogy space...</div>,
  },
);

const roleOptions: Array<{ value: ViewerRole; label: string; description: string }> = [
  { value: "owner", label: "Curator Lens", description: "Full archive detail" },
  { value: "viewer", label: "Restricted Lens", description: "Privacy masking enabled" },
];

const sceneModes: Array<{ value: SceneMode; label: string; description: string }> = [
  { value: "subgraph", label: "Connected Cluster", description: "Immediate family around the focus" },
  { value: "ancestors", label: "Ancestral Branch", description: "Trace upward through prior generations" },
  { value: "descendants", label: "Descendant Branch", description: "Follow the line forward in time" },
];

type DirectRelation = {
  personId: string;
  displayName: string;
  relationLabel: string;
  subtitle: string;
};

export default function HomePage() {
  const router = useRouter();
  const [role, setRole] = useState<ViewerRole>("owner");
  const [curatorName, setCuratorName] = useState("Archive Curator");
  const [curatorRole, setCuratorRole] = useState<ViewerRole>("owner");
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [chunk, setChunk] = useState<GraphChunk | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<PersonSummary | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [sceneMode, setSceneMode] = useState<SceneMode>("subgraph");
  const [kinship, setKinship] = useState<KinshipResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("Bootstrapping the pilot workspace.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const deferredSearchText = useDeferredValue(searchText);
  const requestedPersonId = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return new URLSearchParams(window.location.search).get("personId");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setIsLoading(true);
        setStatusMessage("Checking curator access.");
        const session = await fetchAuthSession();

        if (cancelled) {
          return;
        }

        if (!session) {
          setStatusMessage("Redirecting to sign in.");
          router.replace("/login");
          return;
        }

        setCuratorName(session.user.displayName);
        setCuratorRole(session.user.role);
        setStatusMessage(`Loading workspace summary for ${session.user.displayName}.`);
        const [workspaceSummary, workspaceChunk] = await Promise.all([
          fetchWorkspaceSummary(),
          fetchWorkspaceScene(role),
        ]);

        if (cancelled) {
          return;
        }

        setSummary(workspaceSummary);
        setChunk(workspaceChunk);
        setSelectedPersonId(requestedPersonId ?? workspaceChunk.focusPersonId);
        setErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to load the pilot workspace.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [requestedPersonId, role, router]);

  useEffect(() => {
    let cancelled = false;

    async function loadFocusedState() {
      if (!selectedPersonId || !summary) {
        return;
      }

      try {
        setStatusMessage(`Updating ${sceneMode} view for ${selectedPersonId}.`);

        const [person, nextChunk, nextKinship] = await Promise.all([
          fetchPerson(selectedPersonId, role),
          sceneMode === "subgraph"
            ? fetchSubgraph(selectedPersonId, 2, role)
            : fetchLineage(selectedPersonId, sceneMode, 3, role),
          fetchKinship(summary.defaultFocusPersonId, selectedPersonId, role),
        ]);

        if (cancelled) {
          return;
        }

        setSelectedPerson(person);
        setChunk(nextChunk);
        setKinship(nextKinship);
        setErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to update the selected person.",
          );
        }
      }
    }

    void loadFocusedState();

    return () => {
      cancelled = true;
    };
  }, [role, sceneMode, selectedPersonId, summary]);

  useEffect(() => {
    let cancelled = false;

    async function runSearch() {
      if (deferredSearchText.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      try {
        const results = await searchPeople(deferredSearchText, role);
        if (!cancelled) {
          setSearchResults(results);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Search failed.");
        }
      }
    }

    void runSearch();

    return () => {
      cancelled = true;
    };
  }, [deferredSearchText, role]);

  const directRelations = selectedPersonId && chunk ? deriveDirectRelations(chunk, selectedPersonId) : [];
  const sceneModeLabel = sceneModes.find((mode) => mode.value === sceneMode)?.label ?? "Connected Cluster";
  const selectedIsRoot = summary?.defaultFocusPersonId === selectedPersonId;
  const rootPerson =
    chunk?.nodes.find((node) => node.id === summary?.defaultFocusPersonId) ??
    (selectedIsRoot ? selectedPerson : null);

  const handleSelectPerson = (personId: string) => {
    startTransition(() => {
      setSelectedPersonId(personId);
      setSearchText("");
      setSearchResults([]);
    });
  };

  const handleResetView = () => {
    startTransition(() => {
      setSceneMode("subgraph");
      setSelectedPersonId(summary?.defaultFocusPersonId ?? chunk?.focusPersonId ?? null);
      setSearchText("");
      setSearchResults([]);
    });
  };

  return (
    <main className={styles.workspace}>
      <aside className={styles.archiveSidebar}>
        <div className={styles.sidebarBrand}>
          <h2>The Archive</h2>
          <p>Family Registry</p>
        </div>

        <nav className={styles.sidebarNav}>
          <Link href="/admin" className={styles.sidebarLink}>
            <DashboardIcon />
            <span>Dashboard</span>
          </Link>
          <Link href="/" className={`${styles.sidebarLink} ${styles.sidebarLinkActive}`}>
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

        <Link href="/admin/records/new" className={styles.sidebarPrimaryAction}>
          Add New Record
        </Link>

        <div className={styles.sidebarFooter}>
          <button type="button" className={styles.sidebarButton}>
            <HelpIcon />
            <span>Help Center</span>
          </button>
        </div>
      </aside>

      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <span className={styles.topBrand}>The Living Archive</span>
          <nav className={styles.topNavLinks}>
            <Link href="/admin">Research</Link>
            <Link href="/admin/imports">Records</Link>
            <button type="button">Timeline</button>
          </nav>
        </div>

        <div className={styles.topBarRight}>
          <button type="button" className={styles.topIconButton} aria-label="Notifications">
            <BellIcon />
          </button>
          <button type="button" className={styles.topIconButton} aria-label="Settings">
            <SettingsIcon />
          </button>
          <div
            className={styles.topAvatar}
            title={`${curatorName} • ${formatRoleLabel(curatorRole)}`}
          >
            {buildInitials(curatorName)}
          </div>
        </div>
      </header>

      <div className={styles.treeLayout}>
        <section className={styles.navigatorPanel}>
          <div className={styles.navigatorHeader}>
            <h3>Tree Navigator</h3>
            <p>Search and reposition the current family line.</p>
          </div>

          <div className={styles.statusChip}>{statusMessage}</div>
          {errorMessage ? <div className={styles.errorChip}>{errorMessage}</div> : null}

          <div className={styles.navigatorSection}>
            <label className={styles.sectionLabel} htmlFor="tree-search">
              Search the archive
            </label>
            <div className={styles.searchShell}>
              <SearchIcon />
              <input
                id="tree-search"
                className={styles.searchInput}
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Try David, Mira, Grace..."
              />
            </div>
            {searchResults.length > 0 ? (
              <div className={styles.searchResults}>
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className={styles.searchResult}
                    onClick={() => handleSelectPerson(result.id)}
                  >
                    <strong>{result.displayName}</strong>
                    <span>{result.branch}</span>
                    <small>{result.subtitle}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className={styles.navigatorSection}>
            <span className={styles.sectionLabel}>Lineage lens</span>
            <div className={styles.optionList}>
              {sceneModes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={
                    mode.value === sceneMode ? styles.optionCardActive : styles.optionCard
                  }
                  onClick={() => setSceneMode(mode.value)}
                >
                  <strong>{mode.label}</strong>
                  <span>{mode.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.navigatorSection}>
            <span className={styles.sectionLabel}>Viewer lens</span>
            <div className={styles.roleRow}>
              {roleOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={
                    option.value === role ? styles.roleButtonActive : styles.roleButton
                  }
                  onClick={() => setRole(option.value)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.navigatorSection}>
            <span className={styles.sectionLabel}>Workspace signals</span>
            <dl className={styles.metricList}>
              <div>
                <dt>People</dt>
                <dd>{formatCount(summary?.peopleCount ?? 0)}</dd>
              </div>
              <div>
                <dt>Living</dt>
                <dd>{formatCount(summary?.livingPeopleCount ?? 0)}</dd>
              </div>
              <div>
                <dt>Sources</dt>
                <dd>{formatCount(summary?.sourceCount ?? 0)}</dd>
              </div>
              <div>
                <dt>Graph</dt>
                <dd>{summary?.graphVersion ?? "seed-v2"}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className={styles.stageColumn}>
          <div className={styles.stageHeader}>
            <div>
              <p className={styles.stageEyebrow}>Live Tree Browser</p>
              <h1 className={styles.stageTitle}>{chunk?.workspaceId ?? "Family Tree"}</h1>
            </div>
            <div className={styles.stageBadgeRow}>
              <span className={styles.stageBadge}>{summary?.graphVersion ?? "seed-v2"}</span>
              <span className={styles.stageBadge}>{sceneModeLabel}</span>
              <span className={styles.stageBadge}>{formatRoleLabel(role)} Lens</span>
              {selectedPerson ? <span className={styles.stageBadge}>{selectedPerson.branch}</span> : null}
            </div>
          </div>

          <div className={styles.treeStage}>
            <div className={styles.stageIntro}>
              <p>{selectedIsRoot ? "Primary Root" : "Selected Record"}</p>
              <strong>{selectedPerson?.displayName ?? rootPerson?.displayName ?? "Loading focus"}</strong>
              <span>{formatLifespan(selectedPerson ?? rootPerson)}</span>
            </div>

            <div className={styles.treeCanvas}>
              {chunk ? (
                <CanonicalGenealogyScene
                  chunk={chunk}
                  selectedPersonId={selectedPersonId}
                  onSelectPerson={handleSelectPerson}
                />
              ) : (
                <div className={styles.sceneFallback}>
                  {isLoading ? "Loading graph scene..." : "No scene data is available."}
                </div>
              )}
            </div>

            <div className={styles.focusSummary}>
              <span className={styles.focusSummaryLabel}>
                {selectedPerson?.isLiving ? "Living record" : selectedIsRoot ? "Root focus" : "Archive focus"}
              </span>
              <strong>{selectedPerson?.displayName ?? "Pick a node in the tree"}</strong>
              <p>
                {selectedPerson?.summary ??
                  "Search for a person or click a node to inspect the family line and supporting evidence."}
              </p>
            </div>
          </div>

          <div className={styles.controlDock}>
            <button type="button" className={styles.primaryDockButton} onClick={handleResetView}>
              <ResetIcon />
              <span>Reset View</span>
            </button>

            <div className={styles.dockDivider} aria-hidden="true" />

            <div className={styles.dockModeRow}>
              {sceneModes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={
                    mode.value === sceneMode ? styles.dockModeActive : styles.dockMode
                  }
                  onClick={() => setSceneMode(mode.value)}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={styles.secondaryDockButton}
              onClick={() =>
                summary?.defaultFocusPersonId
                  ? handleSelectPerson(summary.defaultFocusPersonId)
                  : undefined
              }
            >
              <FocusIcon />
              <span>Focus on Root</span>
            </button>
          </div>
        </section>

        <aside className={styles.detailRail}>
          <div className={styles.detailHero}>
            <span className={styles.detailBadge}>
              {selectedIsRoot ? "Primary Root" : selectedPerson?.isLiving ? "Living Record" : "Historical Record"}
            </span>
            <h2>{selectedPerson?.displayName ?? "Select a person"}</h2>
            <p>{formatLifespan(selectedPerson)}</p>
          </div>

          <div className={styles.detailBody}>
            <section className={styles.detailSection}>
              <h3>Biography</h3>
              <p className={styles.detailText}>
                {selectedPerson?.summary ??
                  "Pick a person in the scene to inspect biography notes, direct relations, and evidence."}
              </p>
            </section>

            <section className={styles.detailSection}>
              <h3>Vital Records</h3>
              <div className={styles.factList}>
                <div className={styles.factItem}>
                  <span className={styles.factIcon}>
                    <BirthIcon />
                  </span>
                  <div>
                    <strong>Birth</strong>
                    <small>{selectedPerson?.birthLabel ?? "Not recorded in this view"}</small>
                  </div>
                </div>
                <div className={styles.factItem}>
                  <span className={styles.factIcon}>
                    <LocationIcon />
                  </span>
                  <div>
                    <strong>Branch</strong>
                    <small>{selectedPerson?.branch ?? "Awaiting selection"}</small>
                  </div>
                </div>
                <div className={styles.factItem}>
                  <span className={styles.factIcon}>
                    <ArchiveNoteIcon />
                  </span>
                  <div>
                    <strong>Evidence</strong>
                    <small>
                      {selectedPerson ? `${selectedPerson.evidence.length} source note(s)` : "No person selected"}
                    </small>
                  </div>
                </div>
                <div className={styles.factItem}>
                  <span className={styles.factIcon}>
                    <SceneIcon />
                  </span>
                  <div>
                    <strong>Scene View</strong>
                    <small>{sceneModeLabel}</small>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.detailSection}>
              <h3>Direct Relations</h3>
              {directRelations.length > 0 ? (
                <div className={styles.relationGrid}>
                  {directRelations.map((relation) => (
                    <button
                      key={`${relation.personId}-${relation.relationLabel}`}
                      type="button"
                      className={styles.relationCard}
                      onClick={() => handleSelectPerson(relation.personId)}
                    >
                      <span className={styles.relationAvatar}>
                        {buildInitials(relation.displayName)}
                      </span>
                      <strong>{relation.displayName}</strong>
                      <small>{relation.relationLabel}</small>
                      <em>{relation.subtitle}</em>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.detailMuted}>No direct relations are visible in the current graph slice.</p>
              )}
            </section>

            <section className={styles.detailSection}>
              <h3>Evidence Notes</h3>
              {selectedPerson?.evidence.length ? (
                <div className={styles.noteList}>
                  {selectedPerson.evidence.slice(0, 3).map((item) => (
                    <article key={item.sourceId} className={styles.noteCard}>
                      <strong>{item.title}</strong>
                      <p>{item.note}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className={styles.detailMuted}>No evidence is shown for this viewer lens.</p>
              )}
            </section>

            <section className={styles.detailSection}>
              <h3>Kinship Path</h3>
              {kinship ? (
                <div className={styles.pathList}>
                  {kinship.path.map((step, index) => (
                    <div key={`${step.personId}-${index}`} className={styles.pathStep}>
                      <strong>{step.displayName}</strong>
                      <small>{step.viaRelationship ?? "Starting point"}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.detailMuted}>
                  {selectedIsRoot
                    ? "The selected record is already the root anchor for this workspace."
                    : "Select a record to trace its relationship back to the root person."}
                </p>
              )}
            </section>

            <Link href="/admin/imports" className={styles.archiveButton}>
              <ArchiveOpenIcon />
              <span>View Full Archive</span>
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}

function deriveDirectRelations(chunk: GraphChunk, personId: string): DirectRelation[] {
  const nodeMap = new Map(chunk.nodes.map((node) => [node.id, node]));
  const relations: DirectRelation[] = [];
  const seen = new Set<string>();

  for (const relationship of chunk.relationships) {
    let otherId: string | null = null;
    let relationLabel = relationship.label;

    if (relationship.sourceId === personId) {
      otherId = relationship.targetId;
      relationLabel = relationship.kind === "parent_of" ? "Child" : "Partner";
    } else if (relationship.targetId === personId) {
      otherId = relationship.sourceId;
      relationLabel = relationship.kind === "parent_of" ? "Parent" : "Partner";
    }

    if (!otherId || seen.has(`${otherId}-${relationLabel}`)) {
      continue;
    }

    const person = nodeMap.get(otherId);
    if (!person) {
      continue;
    }

    seen.add(`${otherId}-${relationLabel}`);
    relations.push({
      personId: person.id,
      displayName: person.displayName,
      relationLabel,
      subtitle: person.branch,
    });
  }

  return relations.slice(0, 4);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatLifespan(person: PersonSummary | null | undefined) {
  if (!person) {
    return "Select a record to inspect family detail";
  }

  const labels = [person.birthLabel, person.deathLabel ?? (person.isLiving ? "Living record" : null)].filter(
    Boolean,
  );

  return labels.join(" — ");
}

function formatRoleLabel(role: ViewerRole) {
  if (role === "owner") {
    return "Curator";
  }

  if (role === "editor") {
    return "Editor";
  }

  return "Restricted";
}

function buildInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
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

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.8 2.8 0 1 1 4.8 2c-.6.6-1.3 1-1.8 1.6-.4.4-.5.8-.5 1.5" />
      <circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6.5 9.5a5.5 5.5 0 1 1 11 0c0 5.5 2 6.5 2 6.5h-15s2-1 2-6.5Z" />
      <path d="M10 18a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m12 3 1.3 2.4 2.7.5-.9 2.6 1.9 2-1.9 2 .9 2.6-2.7.5L12 21l-1.3-2.4-2.7-.5.9-2.6-1.9-2 1.9-2-.9-2.6 2.7-.5L12 3Z" />
      <circle cx="12" cy="12" r="3" />
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

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 4v6h6" />
      <path d="M20 20v-6h-6" />
      <path d="M20 10A8 8 0 0 0 7 5.5L4 10" />
      <path d="M4 14a8 8 0 0 0 13 4.5L20 14" />
    </svg>
  );
}

function FocusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

function BirthIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 4h10" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="4" y="6" width="16" height="14" rx="2.5" />
      <path d="M8 12h8" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function ArchiveNoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 4h7l4 4v12H7z" />
      <path d="M14 4v4h4" />
      <path d="M10 13h6" />
      <path d="M10 17h4" />
    </svg>
  );
}

function SceneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m4 16 4-5 4 3 5-7 3 4" />
      <path d="M4 20h16" />
    </svg>
  );
}

function ArchiveOpenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 5h5v5" />
      <path d="M10 14 19 5" />
      <path d="M19 14v4a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
    </svg>
  );
}
