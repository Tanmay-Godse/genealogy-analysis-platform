"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import type { ImportJobSummary } from "@/lib/api";
import { fetchImports, uploadGedcom } from "@/lib/api";

export default function ImportsPage() {
  const [imports, setImports] = useState<ImportJobSummary[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [statusMessage, setStatusMessage] = useState("Load GEDCOM files into the pilot workspace.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadImports() {
      try {
        const jobs = await fetchImports();
        if (!cancelled) {
          setImports(jobs);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load imports.");
        }
      }
    }

    void loadImports();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      setErrorMessage("Choose a GEDCOM file before uploading.");
      return;
    }

    startTransition(async () => {
      try {
        setErrorMessage(null);
        setStatusMessage(`Uploading ${selectedFile.name} and rebuilding the workspace graph.`);
        const importJob = await uploadGedcom(selectedFile);
        const jobs = await fetchImports();
        setImports(jobs);
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        setStatusMessage(
          `Imported ${importJob.filename}. The workspace now points at ${importJob.graphVersion}.`,
        );
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "GEDCOM upload failed.");
      }
    });
  };

  return (
    <main className="shell">
      <section className="heroCard">
        <div className="heroCopy">
          <p className="eyebrow">Admin console · GEDCOM import</p>
          <h1>Bring real family data into the graph.</h1>
          <p className="heroText">
            Upload a GEDCOM file, archive the raw source in MinIO, record the import in PostgreSQL,
            and replace the pilot workspace graph in Neo4j plus OpenSearch.
          </p>
          <Link href="/" className="heroLink">
            Back to workspace
          </Link>
        </div>
        <div className="heroRail">
          <div className="statusBadge">{statusMessage}</div>
          {errorMessage ? <div className="errorBadge">{errorMessage}</div> : null}
          <form className="uploadCard" onSubmit={handleSubmit}>
            <label className="controlLabel" htmlFor="gedcom-upload">
              GEDCOM file
            </label>
            <input
              id="gedcom-upload"
              ref={fileInputRef}
              className="fileInput"
              type="file"
              accept=".ged,.gedcom,text/plain"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
            <button type="submit" className="primaryButton" disabled={isPending}>
              {isPending ? "Importing…" : "Upload and rebuild graph"}
            </button>
          </form>
        </div>
      </section>

      <section className="detailsPanel importPanel">
        <div className="panelHeader">
          <div>
            <p className="panelEyebrow">Recent imports</p>
            <h2>Import history</h2>
          </div>
        </div>

        {imports.length > 0 ? (
          <div className="importList">
            {imports.map((job) => (
              <article key={job.importId} className="importCard">
                <div className="importTopline">
                  <strong>{job.filename}</strong>
                  <span className={`importStatus ${job.status}`}>{job.status}</span>
                </div>
                <p className="mutedText">
                  Graph version {job.graphVersion} · people {job.peopleCount} · families {job.familyCount}
                  {" · "}relationships {job.relationshipCount}
                </p>
                <p className="mutedText">
                  Workspace {job.workspaceId}
                  {job.focusPersonId ? ` · focus ${job.focusPersonId}` : ""}
                </p>
                {job.error ? <p className="errorInline">{job.error}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="mutedText">
            No imports recorded yet. The current workspace is still using the seed dataset.
          </p>
        )}
      </section>
    </main>
  );
}
