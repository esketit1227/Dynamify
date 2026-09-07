"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { ElementPersonalize } from "@/components/sites/element-personalize";
import { elementTypeLabel, sectionLabel } from "@/lib/format/labels";
import type { ContentElementDTO } from "@/lib/sites/dto";
import type { AudienceDTO } from "@/lib/audiences/dto";

// docs/launch-plan.md §5D — the actual "click it, review it right there"
// surface: reuses ElementPersonalize (src/components/sites/element-
// personalize.tsx) wholesale rather than a second review UI — that widget
// already does approve/pause/delete/add-a-rule correctly; this just gives
// it a place to appear next to what you clicked instead of a flat list you
// have to go find on the Sites page. Extracted out of live-view.tsx once a
// second consumer (the /content page) needed the identical slide-over.
export function ReviewPanel({
  organizationId,
  element,
  audiences,
  library,
  onClose,
  onChanged,
}: {
  organizationId: string;
  element: ContentElementDTO | null;
  audiences: AudienceDTO[];
  library: string[];
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <AnimatePresence>
      {element ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-foreground/10"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Review this element"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.2 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l border-border bg-surface p-5 shadow-xl"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium tracking-wide text-muted uppercase">
                  {sectionLabel(element.section)}
                </p>
                <h2 className="text-sm font-semibold text-foreground">{elementTypeLabel(element.elementType)}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mb-4 rounded-lg border border-border bg-background p-2.5 text-sm text-foreground">
              {element.currentContent}
            </p>
            <ElementPersonalize
              organizationId={organizationId}
              element={element}
              audiences={audiences}
              library={library}
              onChanged={onChanged}
            />
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
