import { create } from "zustand";

export type Theme = "dark" | "light";

interface UiState {
  theme: Theme;
  toggleTheme(): void;

  focusTicketComposerToken: number;
  triggerFocusComposer(): void;

  commandOpen: boolean;
  setCommandOpen(v: boolean): void;

  quickSwitcherOpen: boolean;
  setQuickSwitcherOpen(v: boolean): void;

  cheatsheetOpen: boolean;
  setCheatsheetOpen(v: boolean): void;

  focusViewOpen: boolean;
  setFocusViewOpen(v: boolean): void;

  selectedTickets: string[];
  setSelectedTickets(ids: string[]): void;

  openTicketId: string | null;
  openTicket(id: string | null): void;
}

export const useUiStore = create<UiState>((set) => ({
  theme: (localStorage.getItem("tide.theme") as Theme | null) ?? "dark",
  toggleTheme: () =>
    set((s) => {
      const next: Theme = s.theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("tide.theme", next);
      } catch {
        // best-effort
      }
      document.documentElement.classList.toggle("dark", next === "dark");
      document.documentElement.classList.toggle("light", next === "light");
      return { theme: next };
    }),

  focusTicketComposerToken: 0,
  triggerFocusComposer: () =>
    set((s) => ({ focusTicketComposerToken: s.focusTicketComposerToken + 1 })),

  commandOpen: false,
  setCommandOpen: (v) => set({ commandOpen: v }),

  quickSwitcherOpen: false,
  setQuickSwitcherOpen: (v) => set({ quickSwitcherOpen: v }),

  cheatsheetOpen: false,
  setCheatsheetOpen: (v) => set({ cheatsheetOpen: v }),

  focusViewOpen: false,
  setFocusViewOpen: (v) => set({ focusViewOpen: v }),

  selectedTickets: [],
  setSelectedTickets: (ids) => set({ selectedTickets: ids }),

  openTicketId: null,
  openTicket: (id) => set({ openTicketId: id }),
}));
