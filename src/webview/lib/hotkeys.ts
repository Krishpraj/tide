// @ts-expect-error - tinykeys package.json exports map blocks TS resolution
import { tinykeys } from "tinykeys";
import { useEffect } from "react";
import { useUiStore } from "../uistore";

type Handler = (e: KeyboardEvent) => void;

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (
    t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT" ||
    t.isContentEditable
  )
    return true;
  return false;
}

export function useGlobalHotkeys() {
  useEffect(() => {
    const trigger = useUiStore.getState().triggerFocusComposer;
    const setCmd = useUiStore.getState().setCommandOpen;
    const setQs = useUiStore.getState().setQuickSwitcherOpen;
    const setCs = useUiStore.getState().setCheatsheetOpen;
    const setFv = useUiStore.getState().setFocusViewOpen;
    const toggleTheme = useUiStore.getState().toggleTheme;

    const bindings: Record<string, Handler> = {
      c: (e: KeyboardEvent) => {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        trigger();
      },
      "$mod+k": (e: KeyboardEvent) => {
        e.preventDefault();
        setCmd(true);
      },
      "$mod+p": (e: KeyboardEvent) => {
        e.preventDefault();
        setQs(true);
      },
      "?": (e: KeyboardEvent) => {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        setCs(true);
      },
      f: (e: KeyboardEvent) => {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        setFv(!useUiStore.getState().focusViewOpen);
      },
      t: (e: KeyboardEvent) => {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        toggleTheme();
      },
      Escape: () => {
        setCmd(false);
        setQs(false);
        setCs(false);
        setFv(false);
      },
    };
    const unsub = tinykeys(window, bindings);
    return () => unsub();
  }, []);
}
