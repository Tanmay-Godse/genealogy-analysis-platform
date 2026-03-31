"use client";

import dynamic from "next/dynamic";
import { startTransition, useDeferredValue, useEffect, useState } from "react";

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
  fetchKinship,
  fetchLineage,
  fetchPerson,
  fetchSubgraph,
  fetchWorkspaceScene,
  fetchWorkspaceSummary,
  searchPeople,
} from "@/lib/api";

const CanonicalGenealogyScene = dynamic(
  () =>
    import("@/components/scene/canonical-genealogy-scene").then(
      (module) => module.CanonicalGenealogyScene,
    ),
  {
    ssr: false,
    loading: () => <div className="sceneLoading">Rendering the genealogy space…</div>,
  },
);

const roleOptions: ViewerRole[] = ["owner", "viewer"];
const sceneModes: Array<{ value: SceneMode; label: string }> = [
  { value: "subgraph", label: "Connected cluster" },
  { value: "ancestors", label: "Ancestors" },
  { value: "descendants", label: "Descendants" },
];

export default function HomePage() {
  const [role, setRole] = useState<ViewerRole>("owner");
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

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setIsLoading(true);
        setStatusMessage("Loading workspace summary and canonical scene.");
        const [workspaceSummary, workspaceChunk] = await Promise.all([
          fetchWorkspaceSummary(),
          fetchWorkspaceScene(role),
        ]);

        if (cancelled) {
          return;
        }

        setSummary(workspaceSummary);
        setChunk(workspaceChunk);
        setSelectedPersonId(workspaceChunk.focusPersonId);
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
  }, [role]);

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

  const metrics = summary
    ? [
        { label: "People", value: summary.peopleCount.toString() },
        { label: "Living", value: summary.livingPeopleCount.toString() },
        { label: "Sources", value: summary.sourceCount.toString() },
        { label: "Relationships", value: summary.relationshipCount.toString() },
      ]
    : [];

  const handleSelectPerson = (personId: string) => {
    startTransition(() => {
      setSelectedPersonId(personId);
      setSearchText("");
      setSearchResults([]);
    });
  };

  return (
    <main className="shell">
      <section className="heroCard">
        <div className="heroCopy">
          <p className="eyebrow">Pilot release · canonical genealogy workspace</p>
          <h1>Evidence-first family exploration with a live 3D scene.</h1>
          <p className="heroText">
            This scaffold starts with a strict-privacy pilot: search a person, refocus the graph,
            swap between owner and viewer perspectives, and inspect the evidence that supports each
            connection.
          </p>
        </div>
        <div className="heroRail">
          <div className="statusBadge">{statusMessage}</div>
          {errorMessage ? <div className="errorBadge">{errorMessage}</div> : null}
          <div className="metricGrid">
            {metrics.map((metric) => (
              <article key={metric.label} className="metricCard">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="controlPanel">
        <div className="controlBlock">
          <span className="controlLabel">Viewer role</span>
          <div className="segmented">
            {roleOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={option === role ? "segment active" : "segment"}
                onClick={() => setRole(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="controlBlock searchBlock">
          <label className="controlLabel" htmlFor="person-search">
            Search a person
          </label>
          <input
            id="person-search"
            className="searchInput"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Try David, Mira, Grace..."
          />
          {searchResults.length > 0 ? (
            <div className="searchResults">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className="searchResult"
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

        <div className="controlBlock">
          <span className="controlLabel">View focus</span>
          <div className="segmented">
            {sceneModes.map((mode) => (
              <button
                key={mode.value}
                type="button"
                className={mode.value === sceneMode ? "segment active" : "segment"}
                onClick={() => setSceneMode(mode.value)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="workspaceGrid">
        <article className="scenePanel">
          <div className="panelHeader">
            <div>
              <p className="panelEyebrow">Canonical scene</p>
              <h2>{chunk?.workspaceId ?? "Loading scene"}</h2>
            </div>
            <span className="panelChip">{summary?.graphVersion ?? "seed-v1"}</span>
          </div>

          {chunk ? (
            <CanonicalGenealogyScene
              chunk={chunk}
              selectedPersonId={selectedPersonId}
              onSelectPerson={handleSelectPerson}
            />
          ) : (
            <div className="sceneLoading">{isLoading ? "Loading graph scene…" : "No scene data."}</div>
          )}
        </article>

        <article className="detailsPanel">
          <div className="panelHeader">
            <div>
              <p className="panelEyebrow">Focus detail</p>
              <h2>{selectedPerson?.displayName ?? "Select a person"}</h2>
            </div>
            {selectedPerson ? (
              <span className={selectedPerson.isMasked ? "panelChip masked" : "panelChip"}>
                {selectedPerson.isMasked ? "Masked" : selectedPerson.branch}
              </span>
            ) : null}
          </div>

          {selectedPerson ? (
            <>
              <p className="detailSummary">{selectedPerson.summary}</p>
              <div className="pillRow">
                {selectedPerson.birthLabel ? <span className="pill">{selectedPerson.birthLabel}</span> : null}
                {selectedPerson.deathLabel ? <span className="pill">{selectedPerson.deathLabel}</span> : null}
                <span className="pill">
                  {selectedPerson.isLiving ? "Living person" : "Historical record"}
                </span>
              </div>

              <section className="detailSection">
                <h3>Evidence</h3>
                {selectedPerson.evidence.length > 0 ? (
                  selectedPerson.evidence.map((item) => (
                    <article key={item.sourceId} className="evidenceCard">
                      <strong>{item.title}</strong>
                      <p>{item.note}</p>
                    </article>
                  ))
                ) : (
                  <p className="mutedText">No evidence is shown for this viewer role.</p>
                )}
              </section>

              <section className="detailSection">
                <h3>Kinship path from default focus</h3>
                {kinship ? (
                  <>
                    <p className="mutedText">{kinship.label}</p>
                    <div className="pathList">
                      {kinship.path.map((step, index) => (
                        <div key={`${step.personId}-${index}`} className="pathStep">
                          <strong>{step.displayName}</strong>
                          <span>{step.viaRelationship ?? "starting point"}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mutedText">
                    The selected person is already the default focus anchor for this workspace.
                  </p>
                )}
              </section>
            </>
          ) : (
            <p className="mutedText">Pick a node in the scene or search for a person to inspect the pilot data.</p>
          )}
        </article>
      </section>
    </main>
  );
}
