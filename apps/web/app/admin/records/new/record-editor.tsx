"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";

import type { AuthSessionSummary, RecordCreateInput, SearchResult, ViewerRole } from "@/lib/api";
import { createFamilyRecord, fetchAuthSession, searchPeople } from "@/lib/api";

import styles from "./record-editor.module.css";

type RelationSelection = SearchResult | null;

type RelationPickerProps = {
  label: string;
  description: string;
  role: ViewerRole;
  selected: RelationSelection;
  excludeIds: string[];
  onSelect: (result: SearchResult | null) => void;
};

const initialForm: RecordCreateInput = {
  firstName: "",
  lastName: "",
  branch: "",
  birthLabel: "",
  birthPlace: "",
  deathLabel: "",
  deathPlace: "",
  isLiving: true,
  summary: "",
  notes: "",
  fatherId: null,
  motherId: null,
  partnerId: null,
};

export function RecordEditor() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSessionSummary | null>(null);
  const [form, setForm] = useState<RecordCreateInput>(initialForm);
  const [selectedFather, setSelectedFather] = useState<RelationSelection>(null);
  const [selectedMother, setSelectedMother] = useState<RelationSelection>(null);
  const [selectedPartner, setSelectedPartner] = useState<RelationSelection>(null);
  const [statusMessage, setStatusMessage] = useState("Checking curator access.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadEditor() {
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

        if (authSession.user.role === "viewer") {
          setStatusMessage("Redirecting to the curator overview.");
          router.replace("/admin");
          return;
        }

        setSession(authSession);
        setStatusMessage("Fill in the details you know. Relationship links are optional.");
        setErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to load the record editor.",
          );
        }
      }
    }

    void loadEditor();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const profileName = session?.user.displayName ?? "Archive Curator";
  const role = session?.user.role ?? "owner";
  const fullName = `${form.firstName} ${form.lastName}`.trim() || "New family record";
  const saveDisabled = isSaving || !form.firstName.trim() || !form.lastName.trim() || !form.branch.trim();
  const relationIds = useMemo(
    () => [selectedFather?.id, selectedMother?.id, selectedPartner?.id].filter(Boolean) as string[],
    [selectedFather?.id, selectedMother?.id, selectedPartner?.id],
  );

  const handleFieldChange = <K extends keyof RecordCreateInput>(field: K, value: RecordCreateInput[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage("Creating the person record and updating the family graph.");

    try {
      const createdRecord = await createFamilyRecord({
        ...form,
        fatherId: selectedFather?.id ?? null,
        motherId: selectedMother?.id ?? null,
        partnerId: selectedPartner?.id ?? null,
      });

      setStatusMessage(`${createdRecord.person.displayName} was added. Opening the live tree.`);
      router.push(`/?personId=${createdRecord.person.id}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create the family record.",
      );
      setIsSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.topBrandRow}>
          <span className={styles.topBrand}>The Living Archive</span>
          <span className={styles.topBrandSubtle}>Record Editor</span>
        </div>

        <div className={styles.topActions}>
          <Link href="/admin" className={styles.topLink}>
            Dashboard
          </Link>
          <Link href="/" className={styles.topLink}>
            Family Tree
          </Link>
          <div className={styles.topAvatar} title={profileName}>
            {buildInitials(profileName)}
          </div>
        </div>
      </header>

      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarCard}>
            <p className={styles.sidebarLabel}>Archive ID</p>
            <h2 className={styles.sidebarTitle}>ADMIN_CORE_01</h2>
            <p className={styles.sidebarText}>Simple record entry for curators and family administrators.</p>
          </div>

          <nav className={styles.sidebarNav}>
            <Link href="/admin" className={styles.sidebarLink}>
              Dashboard
            </Link>
            <Link href="/" className={`${styles.sidebarLink} ${styles.sidebarLinkActive}`}>
              Family Tree
            </Link>
            <Link href="/admin/imports" className={styles.sidebarLink}>
              Archives
            </Link>
          </nav>

          <div className={styles.sidebarHint}>
            <h3>How this stays simple</h3>
            <p>You only need to enter the facts you know. Pick a father, mother, or partner when available and the tree links are created for you.</p>
          </div>
        </aside>

        <section className={styles.canvas}>
          <div className={styles.headerRow}>
            <div>
              <p className={styles.eyebrow}>Repository / Lineage / Record Editor</p>
              <h1 className={styles.title}>Add a Family Member</h1>
              <p className={styles.subtitle}>
                Create a person record, optionally connect relatives, and the backend graph will expand automatically.
              </p>
            </div>

            <div className={styles.headerButtons}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => router.push("/admin")}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="record-editor-form"
                className={styles.saveButton}
                disabled={saveDisabled}
              >
                {isSaving ? "Saving..." : "Save and Update Tree"}
              </button>
            </div>
          </div>

          <div className={styles.noticeRow}>
            <div className={styles.noticeBadge}>{statusMessage}</div>
            {errorMessage ? <div className={styles.errorBadge}>{errorMessage}</div> : null}
          </div>

          <form id="record-editor-form" className={styles.formGrid} onSubmit={handleSubmit}>
            <div className={styles.primaryColumn}>
              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2>Personal Identity</h2>
                  <p>Start with the basics. These fields become the new person node in the tree.</p>
                </div>

                <div className={styles.fieldGrid}>
                  <label className={styles.field}>
                    <span>First Name</span>
                    <input
                      value={form.firstName}
                      onChange={(event) => handleFieldChange("firstName", event.target.value)}
                      placeholder="Ava"
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Last Name</span>
                    <input
                      value={form.lastName}
                      onChange={(event) => handleFieldChange("lastName", event.target.value)}
                      placeholder="Sterling"
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Branch or Family Line</span>
                    <input
                      value={form.branch}
                      onChange={(event) => handleFieldChange("branch", event.target.value)}
                      placeholder="Sterling family branch"
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Living Status</span>
                    <select
                      value={form.isLiving ? "living" : "historical"}
                      onChange={(event) => {
                        const isLiving = event.target.value === "living";
                        setForm((current) => ({
                          ...current,
                          isLiving,
                          deathLabel: isLiving ? "" : current.deathLabel,
                          deathPlace: isLiving ? "" : current.deathPlace,
                        }));
                      }}
                    >
                      <option value="living">Living person</option>
                      <option value="historical">Historical record</option>
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span>Birth Label</span>
                    <input
                      value={form.birthLabel}
                      onChange={(event) => handleFieldChange("birthLabel", event.target.value)}
                      placeholder="Born April 12, 1845"
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Birth Place</span>
                    <input
                      value={form.birthPlace}
                      onChange={(event) => handleFieldChange("birthPlace", event.target.value)}
                      placeholder="Edinburgh, Scotland"
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Death Label</span>
                    <input
                      value={form.deathLabel}
                      onChange={(event) => handleFieldChange("deathLabel", event.target.value)}
                      placeholder={form.isLiving ? "Disabled for living records" : "Died October 1908"}
                      disabled={form.isLiving}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Death Place</span>
                    <input
                      value={form.deathPlace}
                      onChange={(event) => handleFieldChange("deathPlace", event.target.value)}
                      placeholder={form.isLiving ? "Disabled for living records" : "Boston, Massachusetts"}
                      disabled={form.isLiving}
                    />
                  </label>
                </div>
              </section>

              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2>Biography and Notes</h2>
                  <p>Plain-language narrative helps non-technical staff capture context without worrying about database structure.</p>
                </div>

                <label className={`${styles.field} ${styles.fieldFull}`}>
                  <span>Biographical Narrative</span>
                  <textarea
                    rows={6}
                    value={form.summary}
                    onChange={(event) => handleFieldChange("summary", event.target.value)}
                    placeholder="Describe the person, their role in the family, migrations, occupations, or any notable context."
                  />
                </label>

                <label className={`${styles.field} ${styles.fieldFull}`}>
                  <span>Additional Archive Notes</span>
                  <textarea
                    rows={4}
                    value={form.notes}
                    onChange={(event) => handleFieldChange("notes", event.target.value)}
                    placeholder="Optional notes for curators, uncertainties, or documentation reminders."
                  />
                </label>
              </section>

              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2>Family Links</h2>
                  <p>Search for existing relatives by name. Leave any field empty if you don&apos;t know the link yet.</p>
                </div>

                <div className={styles.relationshipGrid}>
                  <RelationPicker
                    label="Father"
                    description="Adds a parent-to-child link from the selected father."
                    role={role}
                    selected={selectedFather}
                    excludeIds={relationIds.filter((id) => id !== selectedFather?.id)}
                    onSelect={setSelectedFather}
                  />
                  <RelationPicker
                    label="Mother"
                    description="Adds a parent-to-child link from the selected mother."
                    role={role}
                    selected={selectedMother}
                    excludeIds={relationIds.filter((id) => id !== selectedMother?.id)}
                    onSelect={setSelectedMother}
                  />
                  <RelationPicker
                    label="Partner or Spouse"
                    description="Creates a partner connection so the tree can group the household automatically."
                    role={role}
                    selected={selectedPartner}
                    excludeIds={relationIds.filter((id) => id !== selectedPartner?.id)}
                    onSelect={setSelectedPartner}
                  />
                </div>
              </section>
            </div>

            <aside className={styles.secondaryColumn}>
              <section className={styles.sideCard}>
                <h3>What happens when you save</h3>
                <ul className={styles.checkList}>
                  <li>A new person is written into the live family graph.</li>
                  <li>Selected parent and partner links are created automatically.</li>
                  <li>Search and workspace summary refresh so the record appears in the tree.</li>
                </ul>
              </section>

              <section className={styles.sideCard}>
                <h3>Record Preview</h3>
                <div className={styles.previewName}>{fullName}</div>
                <div className={styles.previewBadgeRow}>
                  <span className={styles.previewBadge}>{form.branch || "Branch pending"}</span>
                  <span className={styles.previewBadge}>
                    {form.isLiving ? "Living record" : "Historical record"}
                  </span>
                </div>
                <dl className={styles.previewFacts}>
                  <div>
                    <dt>Birth</dt>
                    <dd>{form.birthLabel || "Not provided yet"}</dd>
                  </div>
                  <div>
                    <dt>Birth place</dt>
                    <dd>{form.birthPlace || "Not provided yet"}</dd>
                  </div>
                  <div>
                    <dt>Father</dt>
                    <dd>{selectedFather?.displayName ?? "Not linked"}</dd>
                  </div>
                  <div>
                    <dt>Mother</dt>
                    <dd>{selectedMother?.displayName ?? "Not linked"}</dd>
                  </div>
                  <div>
                    <dt>Partner</dt>
                    <dd>{selectedPartner?.displayName ?? "Not linked"}</dd>
                  </div>
                </dl>
              </section>

              <section className={styles.sideCard}>
                <h3>Current curator</h3>
                <p className={styles.curatorName}>{profileName}</p>
                <p className={styles.curatorMeta}>{formatRoleLabel(role)} access</p>
              </section>
            </aside>
          </form>
        </section>
      </div>
    </main>
  );
}

function RelationPicker({
  label,
  description,
  role,
  selected,
  excludeIds,
  onSelect,
}: RelationPickerProps) {
  const [query, setQuery] = useState(selected?.displayName ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let cancelled = false;

    async function runSearch() {
      if (deferredQuery.trim().length < 2 || selected?.displayName === deferredQuery.trim()) {
        setResults([]);
        return;
      }

      try {
        const nextResults = await searchPeople(deferredQuery, role);
        if (!cancelled) {
          setResults(nextResults.filter((result) => !excludeIds.includes(result.id)));
        }
      } catch {
        if (!cancelled) {
          setResults([]);
        }
      }
    }

    void runSearch();

    return () => {
      cancelled = true;
    };
  }, [deferredQuery, excludeIds, role, selected?.displayName]);

  return (
    <div className={styles.relationCard}>
      <div className={styles.relationHeader}>
        <h4>{label}</h4>
        <p>{description}</p>
      </div>

      <label className={styles.field}>
        <span>Search by name</span>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!event.target.value.trim()) {
              onSelect(null);
            }
          }}
          placeholder={`Type at least 2 letters to search for ${label.toLowerCase()}`}
        />
      </label>

      {selected ? (
        <div className={styles.selectedRelation}>
          <div>
            <strong>{selected.displayName}</strong>
            <span>{selected.branch}</span>
          </div>
          <button type="button" onClick={() => onSelect(null)}>
            Clear
          </button>
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className={styles.searchResults}>
          {results.slice(0, 5).map((result) => (
            <button
              key={result.id}
              type="button"
              className={styles.searchResult}
              onClick={() => {
                onSelect(result);
                setQuery(result.displayName);
                setResults([]);
              }}
            >
              <strong>{result.displayName}</strong>
              <span>{result.branch}</span>
              <small>{result.subtitle}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function buildInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
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
