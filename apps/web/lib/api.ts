export type ViewerRole = "owner" | "editor" | "viewer";
export type SceneMode = "subgraph" | "ancestors" | "descendants";

export type EvidenceReference = {
  sourceId: string;
  title: string;
  note: string;
};

export type PersonSummary = {
  id: string;
  displayName: string;
  birthLabel: string | null;
  deathLabel: string | null;
  branch: string;
  isLiving: boolean;
  isMasked: boolean;
  summary: string;
  coordinate: [number, number, number];
  evidence: EvidenceReference[];
};

export type RelationshipSummary = {
  id: string;
  sourceId: string;
  targetId: string;
  kind: string;
  label: string;
};

export type GraphChunk = {
  workspaceId: string;
  graphVersion: string;
  focusPersonId: string;
  nodes: PersonSummary[];
  relationships: RelationshipSummary[];
};

export type SearchResult = {
  id: string;
  displayName: string;
  branch: string;
  subtitle: string;
  isMasked: boolean;
};

export type WorkspaceSummary = {
  workspaceId: string;
  graphVersion: string;
  peopleCount: number;
  livingPeopleCount: number;
  sourceCount: number;
  relationshipCount: number;
  defaultFocusPersonId: string;
};

export type ImportStatus = "pending" | "completed" | "failed";

export type ImportJobSummary = {
  importId: string;
  filename: string;
  status: ImportStatus;
  workspaceId: string;
  graphVersion: string;
  storageKey: string | null;
  peopleCount: number;
  familyCount: number;
  relationshipCount: number;
  livingPeopleCount: number;
  focusPersonId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  error: string | null;
};

export type KinshipResult = {
  sourceId: string;
  targetId: string;
  label: string;
  path: Array<{
    personId: string;
    displayName: string;
    viaRelationship: string | null;
  }>;
  evidence: EvidenceReference[];
};

export type AuthUserSummary = {
  userId: string;
  email: string;
  displayName: string;
  role: ViewerRole;
  createdAt: string | null;
  lastLoginAt: string | null;
};

export type AuthSessionSummary = {
  user: AuthUserSummary;
  rememberDevice: boolean;
  createdAt: string | null;
  expiresAt: string;
};

export type RecordCreateInput = {
  firstName: string;
  lastName: string;
  branch: string;
  birthLabel: string;
  birthPlace: string;
  deathLabel: string;
  deathPlace: string;
  isLiving: boolean;
  summary: string;
  notes: string;
  fatherId: string | null;
  motherId: string | null;
  partnerId: string | null;
};

export type RecordCreateResult = {
  workspaceId: string;
  graphVersion: string;
  person: PersonSummary;
  relationships: RelationshipSummary[];
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function mapPersonSummary(payload: {
  id: string;
  display_name?: string;
  displayName?: string;
  birth_label?: string | null;
  birthLabel?: string | null;
  death_label?: string | null;
  deathLabel?: string | null;
  branch: string;
  is_living?: boolean;
  isLiving?: boolean;
  is_masked?: boolean;
  isMasked?: boolean;
  summary: string;
  coordinate: [number, number, number];
  evidence: Array<{
    source_id?: string;
    sourceId?: string;
    title: string;
    note: string;
  }>;
}): PersonSummary {
  return {
    id: payload.id,
    displayName: payload.display_name ?? payload.displayName ?? "Unknown person",
    birthLabel: payload.birth_label ?? payload.birthLabel ?? null,
    deathLabel: payload.death_label ?? payload.deathLabel ?? null,
    branch: payload.branch,
    isLiving: payload.is_living ?? payload.isLiving ?? false,
    isMasked: payload.is_masked ?? payload.isMasked ?? false,
    summary: payload.summary,
    coordinate: payload.coordinate,
    evidence: payload.evidence.map((item) => ({
      sourceId: item.source_id ?? item.sourceId ?? "",
      title: item.title,
      note: item.note,
    })),
  };
}

function mapRelationshipSummary(payload: {
  id: string;
  source_id?: string;
  sourceId?: string;
  target_id?: string;
  targetId?: string;
  kind: string;
  label: string;
}): RelationshipSummary {
  return {
    id: payload.id,
    sourceId: payload.source_id ?? payload.sourceId ?? "",
    targetId: payload.target_id ?? payload.targetId ?? "",
    kind: payload.kind,
    label: payload.label,
  };
}

function mapGraphChunk(payload: {
  workspace_id?: string;
  workspaceId?: string;
  graph_version?: string;
  graphVersion?: string;
  focus_person_id?: string;
  focusPersonId?: string;
  nodes: Array<Parameters<typeof mapPersonSummary>[0]>;
  relationships: Array<Parameters<typeof mapRelationshipSummary>[0]>;
}): GraphChunk {
  return {
    workspaceId: payload.workspace_id ?? payload.workspaceId ?? "unknown-workspace",
    graphVersion: payload.graph_version ?? payload.graphVersion ?? "unknown-version",
    focusPersonId: payload.focus_person_id ?? payload.focusPersonId ?? "",
    nodes: payload.nodes.map(mapPersonSummary),
    relationships: payload.relationships.map(mapRelationshipSummary),
  };
}

function mapImportJobSummary(payload: {
  import_id: string;
  filename: string;
  status: ImportStatus;
  workspace_id: string;
  graph_version: string;
  storage_key?: string | null;
  people_count?: number;
  family_count?: number;
  relationship_count?: number;
  living_people_count?: number;
  focus_person_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  error?: string | null;
}): ImportJobSummary {
  return {
    importId: payload.import_id,
    filename: payload.filename,
    status: payload.status,
    workspaceId: payload.workspace_id,
    graphVersion: payload.graph_version,
    storageKey: payload.storage_key ?? null,
    peopleCount: payload.people_count ?? 0,
    familyCount: payload.family_count ?? 0,
    relationshipCount: payload.relationship_count ?? 0,
    livingPeopleCount: payload.living_people_count ?? 0,
    focusPersonId: payload.focus_person_id ?? null,
    createdAt: payload.created_at ?? null,
    updatedAt: payload.updated_at ?? null,
    error: payload.error ?? null,
  };
}

function mapAuthSessionSummary(payload: {
  user: {
    user_id?: string;
    userId?: string;
    email: string;
    display_name?: string;
    displayName?: string;
    role: ViewerRole;
    created_at?: string | null;
    createdAt?: string | null;
    last_login_at?: string | null;
    lastLoginAt?: string | null;
  };
  remember_device?: boolean;
  rememberDevice?: boolean;
  created_at?: string | null;
  createdAt?: string | null;
  expires_at?: string;
  expiresAt?: string;
}): AuthSessionSummary {
  return {
    user: {
      userId: payload.user.user_id ?? payload.user.userId ?? "",
      email: payload.user.email,
      displayName: payload.user.display_name ?? payload.user.displayName ?? "Archive user",
      role: payload.user.role,
      createdAt: payload.user.created_at ?? payload.user.createdAt ?? null,
      lastLoginAt: payload.user.last_login_at ?? payload.user.lastLoginAt ?? null,
    },
    rememberDevice: payload.remember_device ?? payload.rememberDevice ?? false,
    createdAt: payload.created_at ?? payload.createdAt ?? null,
    expiresAt: payload.expires_at ?? payload.expiresAt ?? "",
  };
}

function mapRecordCreateResult(payload: {
  workspace_id?: string;
  workspaceId?: string;
  graph_version?: string;
  graphVersion?: string;
  person: Parameters<typeof mapPersonSummary>[0];
  relationships: Array<Parameters<typeof mapRelationshipSummary>[0]>;
}): RecordCreateResult {
  return {
    workspaceId: payload.workspace_id ?? payload.workspaceId ?? "unknown-workspace",
    graphVersion: payload.graph_version ?? payload.graphVersion ?? "unknown-version",
    person: mapPersonSummary(payload.person),
    relationships: payload.relationships.map(mapRelationshipSummary),
  };
}

async function graphqlRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message);
  }

  if (!payload.data) {
    throw new Error("GraphQL request returned no data.");
  }

  return payload.data;
}

export async function fetchWorkspaceSummary(): Promise<WorkspaceSummary> {
  const response = await fetch(`${API_BASE_URL}/api/v1/workspace/summary`, {
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Workspace summary request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    workspace_id: string;
    graph_version: string;
    people_count: number;
    living_people_count: number;
    source_count: number;
    relationship_count: number;
    default_focus_person_id: string;
  };

  return {
    workspaceId: payload.workspace_id,
    graphVersion: payload.graph_version,
    peopleCount: payload.people_count,
    livingPeopleCount: payload.living_people_count,
    sourceCount: payload.source_count,
    relationshipCount: payload.relationship_count,
    defaultFocusPersonId: payload.default_focus_person_id,
  };
}

export async function fetchWorkspaceScene(role: ViewerRole): Promise<GraphChunk> {
  const data = await graphqlRequest<{
    workspaceScene: {
      workspaceId: string;
      graphVersion: string;
      focusPersonId: string;
      nodes: Array<Parameters<typeof mapPersonSummary>[0]>;
      relationships: Array<Parameters<typeof mapRelationshipSummary>[0]>;
    };
  }>(
    `
      query WorkspaceScene($role: String!) {
        workspaceScene(role: $role) {
          workspaceId
          graphVersion
          focusPersonId
          nodes {
            id
            displayName
            birthLabel
            deathLabel
            branch
            isLiving
            isMasked
            summary
            coordinate
            evidence {
              sourceId
              title
              note
            }
          }
          relationships {
            id
            sourceId
            targetId
            kind
            label
          }
        }
      }
    `,
    { role },
  );

  return mapGraphChunk(data.workspaceScene);
}

export async function fetchPerson(id: string, role: ViewerRole): Promise<PersonSummary | null> {
  const data = await graphqlRequest<{
    person: Parameters<typeof mapPersonSummary>[0] | null;
  }>(
    `
      query Person($id: String!, $role: String!) {
        person(id: $id, role: $role) {
          id
          displayName
          birthLabel
          deathLabel
          branch
          isLiving
          isMasked
          summary
          coordinate
          evidence {
            sourceId
            title
            note
          }
        }
      }
    `,
    { id, role },
  );

  return data.person ? mapPersonSummary(data.person) : null;
}

export async function searchPeople(text: string, role: ViewerRole): Promise<SearchResult[]> {
  if (!text.trim()) {
    return [];
  }

  const data = await graphqlRequest<{
    searchPeople: Array<{
      id: string;
      displayName: string;
      branch: string;
      subtitle: string;
      isMasked: boolean;
    }>;
  }>(
    `
      query SearchPeople($text: String!, $role: String!) {
        searchPeople(text: $text, role: $role) {
          id
          displayName
          branch
          subtitle
          isMasked
        }
      }
    `,
    { text, role },
  );

  return data.searchPeople;
}

export async function fetchSubgraph(
  personId: string,
  depth: number,
  role: ViewerRole,
): Promise<GraphChunk> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/graph/subgraph?person_id=${personId}&depth=${depth}&role=${role}`,
    { cache: "no-store", credentials: "include" },
  );

  if (!response.ok) {
    throw new Error(`Subgraph request failed with status ${response.status}.`);
  }

  return mapGraphChunk(await response.json());
}

export async function fetchLineage(
  personId: string,
  direction: Exclude<SceneMode, "subgraph">,
  depth: number,
  role: ViewerRole,
): Promise<GraphChunk> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/graph/lineage?person_id=${personId}&direction=${direction}&depth=${depth}&role=${role}`,
    { cache: "no-store", credentials: "include" },
  );

  if (!response.ok) {
    throw new Error(`Lineage request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    chunk: Parameters<typeof mapGraphChunk>[0];
  };

  return mapGraphChunk(payload.chunk);
}

export async function fetchKinship(
  sourceId: string,
  targetId: string,
  role: ViewerRole,
): Promise<KinshipResult | null> {
  if (sourceId === targetId) {
    return null;
  }

  const response = await fetch(
    `${API_BASE_URL}/api/v1/graph/kinship?source_id=${sourceId}&target_id=${targetId}&role=${role}`,
    { cache: "no-store", credentials: "include" },
  );

  if (!response.ok) {
    throw new Error(`Kinship request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    source_id: string;
    target_id: string;
    label: string;
    path: Array<{
      person_id: string;
      display_name: string;
      via_relationship: string | null;
    }>;
    evidence: Array<{
      source_id: string;
      title: string;
      note: string;
    }>;
  };

  return {
    sourceId: payload.source_id,
    targetId: payload.target_id,
    label: payload.label,
    path: payload.path.map((step) => ({
      personId: step.person_id,
      displayName: step.display_name,
      viaRelationship: step.via_relationship,
    })),
    evidence: payload.evidence.map((item) => ({
      sourceId: item.source_id,
      title: item.title,
      note: item.note,
    })),
  };
}

export async function fetchImports(): Promise<ImportJobSummary[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/imports`, {
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Import list request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as Array<Parameters<typeof mapImportJobSummary>[0]>;
  return payload.map(mapImportJobSummary);
}

export async function uploadGedcom(file: File): Promise<ImportJobSummary> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/v1/imports/gedcom`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `GEDCOM upload failed with status ${response.status}.`);
  }

  return mapImportJobSummary(await response.json());
}

export async function createFamilyRecord(input: RecordCreateInput): Promise<RecordCreateResult> {
  const response = await fetch(`${API_BASE_URL}/api/v1/records`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      first_name: input.firstName,
      last_name: input.lastName,
      branch: input.branch,
      birth_label: input.birthLabel || null,
      birth_place: input.birthPlace || null,
      death_label: input.deathLabel || null,
      death_place: input.deathPlace || null,
      is_living: input.isLiving,
      summary: input.summary,
      notes: input.notes || null,
      father_id: input.fatherId,
      mother_id: input.motherId,
      partner_id: input.partnerId,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `Record creation failed with status ${response.status}.`);
  }

  return mapRecordCreateResult(await response.json());
}

export async function loginUser(input: {
  email: string;
  password: string;
  rememberDevice: boolean;
}): Promise<AuthSessionSummary> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      remember_device: input.rememberDevice,
    }),
    credentials: "include",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `Login failed with status ${response.status}.`);
  }

  return mapAuthSessionSummary(await response.json());
}

export async function fetchAuthSession(): Promise<AuthSessionSummary | null> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/session`, {
    cache: "no-store",
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `Session request failed with status ${response.status}.`);
  }

  return mapAuthSessionSummary(await response.json());
}

export async function logoutUser(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `Logout failed with status ${response.status}.`);
  }
}
