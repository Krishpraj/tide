import { create } from "zustand";
import { rpc } from "./rpc";
import type {
  Label,
  Notification,
  Project,
  Repo,
  Ticket,
  WorkerStatus,
} from "@shared/types";

interface TideState {
  projects: Project[];
  currentProjectId: string | null;
  repos: Repo[];
  labels: Label[];
  tickets: Ticket[];
  workers: Record<string, WorkerStatus>;
  notifications: Notification[];
  bootstrapped: boolean;
  bootstrap(): Promise<void>;
  refreshProjects(): Promise<void>;
  refreshRepos(): Promise<void>;
  refreshLabels(): Promise<void>;
  refreshTickets(): Promise<void>;
  refreshNotifications(): Promise<void>;
  setCurrentProject(id: string | null): void;
}

export const useStore = create<TideState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  repos: [],
  labels: [],
  tickets: [],
  workers: {},
  notifications: [],
  bootstrapped: false,

  async bootstrap() {
    if (get().bootstrapped) return;
    const projects = await rpc.listProjects();
    let current = get().currentProjectId;
    if (!current && projects.length > 0) current = projects[0]!.id;
    set({ projects, currentProjectId: current });

    // Subscribe to events.
    rpc.on("projectUpdated", () => get().refreshProjects());
    rpc.on("repoUpdated", () => get().refreshRepos());
    rpc.on("labelUpdated", () => get().refreshLabels());
    rpc.on("ticketUpdated", ({ ticket }) => {
      set((s) => {
        const idx = s.tickets.findIndex((t) => t.id === ticket.id);
        const next = [...s.tickets];
        if (idx >= 0) next[idx] = ticket;
        else next.push(ticket);
        return { tickets: next };
      });
    });
    rpc.on("ticketsBulkUpdated", () => get().refreshTickets());
    rpc.on("workerStatus", (ws) => {
      set((s) => ({ workers: { ...s.workers, [ws.repoId]: ws } }));
    });
    rpc.on("notificationCreated", ({ notification }) => {
      set((s) => ({ notifications: [notification, ...s.notifications] }));
    });

    await Promise.all([
      get().refreshRepos(),
      get().refreshLabels(),
      get().refreshTickets(),
      get().refreshNotifications(),
    ]);
    set({ bootstrapped: true });
  },

  async refreshProjects() {
    const projects = await rpc.listProjects();
    set({ projects });
    if (!projects.find((p) => p.id === get().currentProjectId)) {
      set({ currentProjectId: projects[0]?.id ?? null });
    }
  },
  async refreshRepos() {
    const repos = await rpc.listRepos();
    set({ repos });
  },
  async refreshLabels() {
    const labels = await rpc.listLabels();
    set({ labels });
  },
  async refreshTickets() {
    const tickets = await rpc.listTickets().catch(() => []);
    set({ tickets });
  },
  async refreshNotifications() {
    const notifications = await rpc.listNotifications().catch(() => []);
    set({ notifications });
  },
  setCurrentProject(id) {
    set({ currentProjectId: id });
  },
}));
