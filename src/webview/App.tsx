import { useEffect } from "react";
import { useStore } from "./store";
import { useUiStore } from "./uistore";
import { useGlobalHotkeys } from "./lib/hotkeys";
import { AuthBanner } from "./components/AuthBanner";
import { Sidebar } from "./components/Sidebar";
import { Board } from "./components/Board";
import { TopTabs } from "./components/TopTabs";
import { ReviewPanel } from "./components/ReviewPanel";
import { CommandPalette } from "./components/CommandPalette";
import { QuickSwitcher } from "./components/QuickSwitcher";
import { ShortcutsCheatsheet } from "./components/ShortcutsCheatsheet";
import { FocusView } from "./components/FocusView";

export function App() {
  const bootstrap = useStore((s) => s.bootstrap);
  const theme = useUiStore((s) => s.theme);
  const openTicketId = useUiStore((s) => s.openTicketId);

  useGlobalHotkeys();

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  return (
    <div
      className="h-screen flex flex-col bg-background text-foreground"
      data-theme={theme}
    >
      <AuthBanner />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <TopTabs />
          {openTicketId ? (
            <ReviewPanel ticketId={openTicketId} />
          ) : (
            <Board />
          )}
        </main>
      </div>
      <CommandPalette />
      <QuickSwitcher />
      <ShortcutsCheatsheet />
      <FocusView />
    </div>
  );
}
