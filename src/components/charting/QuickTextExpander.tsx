// src/components/charting/QuickTextExpander.tsx
//
// Textarea wrapper that detects dotphrase triggers as the user types and
// offers expansions from the current user's saved quick texts.
//
// Note on color tokens: this project's palette does not define --teal,
// --teal-lt, or --t2. We substitute the existing semantic tokens
// --accent (teal), --accent / 0.12 for the highlight, and
// --muted-foreground for secondary text.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  detectTriggerAtCursor,
  replaceTrigger,
  type TriggerMatch,
} from "@/lib/expandTriggers";
import { useQuickTexts, type QuickText } from "@/hooks/useQuickTexts";
import { cn } from "@/lib/utils";

type BaseTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
>;

export interface QuickTextExpanderProps extends BaseTextareaProps {
  value: string;
  onChange: (next: string) => void;
}

const PREVIEW_LEN = 60;

const QuickTextExpander = forwardRef<HTMLTextAreaElement, QuickTextExpanderProps>(
  function QuickTextExpander({ value, onChange, className, ...rest }, ref) {
    const localRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(ref, () => localRef.current as HTMLTextAreaElement);

    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const { findMatchingTriggers } = useQuickTexts();

    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [matches, setMatches] = useState<QuickText[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<number>(0);
    const [currentTriggerMatch, setCurrentTriggerMatch] =
      useState<TriggerMatch | null>(null);

    const closePopover = useCallback(() => {
      setIsOpen(false);
      setMatches([]);
      setSelectedIndex(0);
      setCurrentTriggerMatch(null);
    }, []);

    const evaluateTrigger = useCallback(
      (text: string, cursor: number) => {
        const trig = detectTriggerAtCursor(text, cursor);
        if (!trig) {
          closePopover();
          return;
        }
        const found = findMatchingTriggers(trig.trigger);
        if (found.length === 0) {
          closePopover();
          return;
        }
        setCurrentTriggerMatch(trig);
        setMatches(found);
        setSelectedIndex(0);
        setIsOpen(true);
      },
      [findMatchingTriggers, closePopover]
    );

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      onChange(next);
      // Defer trigger detection so we read the cursor after the value commits.
      setTimeout(() => {
        const el = localRef.current;
        if (!el) return;
        const cursor = el.selectionStart ?? next.length;
        evaluateTrigger(next, cursor);
      }, 0);
    };

    const expandMatch = useCallback(
      (qt: QuickText) => {
        if (!currentTriggerMatch) return;
        const { text: nextText, cursorIndex } = replaceTrigger(
          value,
          currentTriggerMatch,
          qt.body
        );
        onChange(nextText);
        closePopover();
        // Restore caret position after React commits.
        setTimeout(() => {
          const el = localRef.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(cursorIndex, cursorIndex);
        }, 0);
      },
      [currentTriggerMatch, value, onChange, closePopover]
    );

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!isOpen || matches.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % matches.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + matches.length) % matches.length);
      } else if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const target = matches[selectedIndex];
        if (target) expandMatch(target);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePopover();
      }
    };

    // Click-outside-to-close.
    useEffect(() => {
      if (!isOpen) return;
      const onDocMouseDown = (ev: MouseEvent) => {
        const node = wrapperRef.current;
        if (node && ev.target instanceof Node && !node.contains(ev.target)) {
          closePopover();
        }
      };
      document.addEventListener("mousedown", onDocMouseDown);
      return () => document.removeEventListener("mousedown", onDocMouseDown);
    }, [isOpen, closePopover]);

    const truncate = (s: string): string =>
      s.length <= PREVIEW_LEN ? s : s.slice(0, PREVIEW_LEN - 1) + "…";

    return (
      <div ref={wrapperRef} className="relative">
        <Textarea
          {...rest}
          ref={localRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className={className}
        />
        {isOpen && matches.length > 0 && (
          <Card
            className="absolute top-full left-0 mt-1 z-50 w-full max-w-md max-h-64 overflow-y-auto shadow-lg"
            role="listbox"
          >
            <CardContent className="p-1">
              {matches.map((qt, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    type="button"
                    key={qt.id}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      // Prevent textarea blur before click fires.
                      e.preventDefault();
                      expandMatch(qt);
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      "w-full text-left p-2 rounded-sm flex items-center gap-2 transition-colors",
                      "hover:bg-[hsl(var(--accent)/0.12)]",
                      isSelected && "bg-[hsl(var(--accent)/0.12)]"
                    )}
                  >
                    <span className="font-mono text-xs text-[hsl(var(--accent))] shrink-0">
                      {qt.trigger}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {truncate(qt.body)}
                    </span>
                  </button>
                );
              })}
              <div className="px-2 py-1 text-[11px] text-muted-foreground border-t mt-1">
                Tab or Enter to expand · Esc to dismiss
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
);

export default QuickTextExpander;