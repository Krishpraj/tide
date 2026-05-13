// Shared types between main process (Bun) and webview (React).

export type TicketStatus =
  | "triage"
  | "backlog"
  | "queued"
  | "in_progress"
  | "review"
  | "done"
  | "discarded"
  | "failed"
  | "canceled"
  | "snoozed";

export type Priority = 0 | 1 | 2 | 3 | 4; // 0=none .. 4=urgent
export type Estimate = "XS" | "S" | "M" | "L" | "XL" | null;
export type LinkKind = "blocks" | "blocked_by" | "duplicates" | "relates_to";

export interface Project {
  id: string;
  name: string;
  color: string;
  position: number;
  createdAt: number;
}

export interface Repo {
  id: string;
  projectId: string | null;
  name: string;
  path: string;
  originUrl: string | null;
  baseBranch: string;
  position: number;
  createdAt: number;
}

export interface Label {
  id: string;
  projectId: string | null;
  name: string;
  color: string;
}

export interface Ticket {
  id: string;
  repoId: string | null;
  parentId: string | null;
  title: string;
  description: string; // TipTap JSON, stringified
  descriptionMd: string;
  status: TicketStatus;
  priority: Priority;
  estimate: Estimate;
  branchName: string | null;
  baseBranch: string | null;
  position: number;
  snoozeUntil: number | null;
  createdAt: number;
  updatedAt: number;
  labels?: Label[];
}

export interface TicketLink {
  id: number;
  fromTicket: string;
  toTicket: string;
  kind: LinkKind;
}

export interface TicketTemplate {
  id: string;
  projectId: string | null;
  name: string;
  icon: string | null;
  titlePrefix: string;
  bodyJson: string;
  position: number;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  body: string;
  bodyMd: string;
  createdAt: number;
  updatedAt: number;
}

export interface TicketEvent {
  id: number;
  ticketId: string;
  ts: number;
  kind: string;
  payload: unknown;
}

export interface ClaudeSession {
  id: string;
  ticketId: string;
  sdkSessionId: string | null;
  status: "running" | "completed" | "errored" | "interrupted" | "canceled";
  startedAt: number;
  endedAt: number | null;
  error: string | null;
}

export interface Notification {
  id: string;
  ticketId: string | null;
  kind: string;
  title: string;
  body: string | null;
  readAt: number | null;
  createdAt: number;
}

export interface SavedView {
  id: string;
  name: string;
  groupBy: string | null;
  sortBy: string | null;
  filtersJson: string;
  position: number;
}

export interface AuthStatus {
  ok: boolean;
  reason?: string;
}

export interface Editor {
  id: string;
  label: string;
  command: string;
}

export interface WorkerStatus {
  repoId: string;
  busy: boolean;
  queueLength: number;
  currentTicketId: string | null;
}

// RPC method map. Keys must match handler names in main/rpc/handlers.ts.
export interface RpcMethods {
  // health
  health(): Promise<{ ok: true; version: string }>;
  // auth
  getAuthStatus(): Promise<AuthStatus>;
  // settings
  getSettings(): Promise<Record<string, unknown>>;
  updateSettings(patch: Record<string, unknown>): Promise<void>;
  // projects
  listProjects(): Promise<Project[]>;
  createProject(input: { name: string; color?: string }): Promise<Project>;
  renameProject(input: { id: string; name: string }): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  // labels
  listLabels(input?: { projectId?: string | null }): Promise<Label[]>;
  createLabel(input: {
    projectId: string | null;
    name: string;
    color: string;
  }): Promise<Label>;
  deleteLabel(id: string): Promise<void>;
  // repos
  listRepos(input?: { projectId?: string | null }): Promise<Repo[]>;
  addRepoLocal(input: {
    path: string;
    projectId: string | null;
  }): Promise<Repo>;
  addRepoClone(input: {
    url: string;
    name?: string;
    projectId: string | null;
  }): Promise<Repo>;
  moveRepoToProject(input: {
    repoId: string;
    projectId: string | null;
  }): Promise<void>;
  removeRepo(id: string): Promise<void>;
  // tickets
  listTickets(input?: {
    projectId?: string | null;
    status?: TicketStatus;
  }): Promise<Ticket[]>;
  getTicket(id: string): Promise<Ticket | null>;
  createTicket(input: {
    title: string;
    description?: string;
    descriptionMd?: string;
    repoId?: string | null;
    parentId?: string | null;
    priority?: Priority;
    estimate?: Estimate;
    labelIds?: string[];
    status?: TicketStatus;
  }): Promise<Ticket>;
  updateTicket(input: { id: string; patch: Partial<Ticket> }): Promise<Ticket>;
  assignTicket(input: {
    ticketId: string;
    repoId: string | null;
  }): Promise<Ticket>;
  setStatus(input: { ticketId: string; status: TicketStatus }): Promise<Ticket>;
  setPriority(input: {
    ticketId: string;
    priority: Priority;
  }): Promise<Ticket>;
  setEstimate(input: { ticketId: string; estimate: Estimate }): Promise<Ticket>;
  setLabels(input: { ticketId: string; labelIds: string[] }): Promise<void>;
  setParent(input: {
    ticketId: string;
    parentId: string | null;
  }): Promise<Ticket>;
  deleteTicket(id: string): Promise<void>;
  duplicateTicket(id: string): Promise<Ticket>;
  bulkUpdate(input: {
    ticketIds: string[];
    patch: Partial<Ticket>;
  }): Promise<void>;
  sendToBacklog(ticketIds: string[]): Promise<void>;
  snoozeTicket(input: { ticketId: string; untilMs: number }): Promise<Ticket>;
  // links
  addLink(input: {
    fromTicketId: string;
    toTicketId: string;
    kind: LinkKind;
  }): Promise<TicketLink>;
  removeLink(id: number): Promise<void>;
  getLinks(ticketId: string): Promise<TicketLink[]>;
  // templates
  listTemplates(input?: { projectId?: string | null }): Promise<TicketTemplate[]>;
  createTemplate(input: {
    projectId: string | null;
    name: string;
    icon?: string | null;
    titlePrefix?: string;
    bodyJson: string;
  }): Promise<TicketTemplate>;
  // comments
  listComments(ticketId: string): Promise<TicketComment[]>;
  addComment(input: {
    ticketId: string;
    body: string;
    bodyMd?: string;
  }): Promise<TicketComment>;
  editComment(input: {
    id: string;
    body: string;
    bodyMd?: string;
  }): Promise<TicketComment>;
  deleteComment(id: string): Promise<void>;
  // saved views
  listSavedViews(): Promise<SavedView[]>;
  saveView(input: Omit<SavedView, "id" | "position">): Promise<SavedView>;
  deleteView(id: string): Promise<void>;
  // events
  getTicketEvents(ticketId: string): Promise<TicketEvent[]>;
  // notifications
  listNotifications(input?: {
    unreadOnly?: boolean;
  }): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  // review / git ops
  getDiff(ticketId: string): Promise<string>;
  refreshDiff(ticketId: string): Promise<string>;
  mergeTicket(input: {
    ticketId: string;
    strategy: "merge" | "squash";
  }): Promise<Ticket>;
  iterateTicket(input: {
    ticketId: string;
    instructions: string;
    instructionsMd?: string;
  }): Promise<void>;
  discardTicket(ticketId: string): Promise<Ticket>;
  cancelTicket(ticketId: string): Promise<void>;
  commitLocalEdits(input: {
    ticketId: string;
    message: string;
  }): Promise<{ committed: boolean; sha?: string }>;
  // editor
  listEditors(): Promise<{ id: string; label: string; command: string }[]>;
  openInEditor(input: { ticketId: string; editorId: string }): Promise<void>;
  // debug (dev only)
  runGit(input: { repoId: string; args: string[] }): Promise<{
    stdout: string;
    stderr: string;
    code: number;
  }>;
}

export type RpcMethodName = keyof RpcMethods;

export interface RpcEvents {
  ticketUpdated: { ticket: Ticket };
  ticketsBulkUpdated: { ids: string[] };
  repoUpdated: { repo: Repo };
  projectUpdated: { project: Project };
  labelUpdated: { label: Label };
  workerStatus: WorkerStatus;
  claudeMessage: { ticketId: string; message: unknown };
  gitEvent: { ticketId: string; kind: string; detail?: string };
  notificationCreated: { notification: Notification };
  authStatus: AuthStatus;
}
export type RpcEventName = keyof RpcEvents;
