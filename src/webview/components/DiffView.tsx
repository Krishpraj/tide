import { useEffect, useRef } from "react";
import { html as renderDiff } from "diff2html";
import "diff2html/bundles/css/diff2html.min.css";

export function DiffView({ unifiedDiff }: { unifiedDiff: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current) return;
    if (!unifiedDiff.trim()) {
      containerRef.current.innerHTML =
        "<p class='text-xs text-muted-foreground p-3'>No changes yet.</p>";
      return;
    }
    const out = renderDiff(unifiedDiff, {
      drawFileList: false,
      matching: "lines",
      outputFormat: "line-by-line",
      colorScheme: "dark",
    } as never);
    containerRef.current.innerHTML = out;
  }, [unifiedDiff]);
  return (
    <div
      ref={containerRef}
      data-testid="diff-view"
      className="text-[12.5px] overflow-x-auto"
    />
  );
}
