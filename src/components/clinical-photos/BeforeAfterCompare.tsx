import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

interface BeforeAfterCompareProps {
  beforeUrl: string;
  afterUrl: string;
  beforeDate?: string;
  afterDate?: string;
  treatmentName?: string;
}

export function BeforeAfterCompare({
  beforeUrl,
  afterUrl,
  beforeDate,
  afterDate,
  treatmentName,
}: BeforeAfterCompareProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString();
  };

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };

  const handleTouchStart = () => {
    setIsDragging(true);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchmove", handleTouchMove);
      document.addEventListener("touchend", handleTouchEnd);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.removeEventListener("touchmove", handleTouchMove);
        document.removeEventListener("touchend", handleTouchEnd);
      };
    }
  }, [isDragging]);

  return (
    <div className="space-y-3">
      {treatmentName && (
        <div>
          <Badge variant="secondary">{treatmentName}</Badge>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative w-full bg-gray-100 rounded-lg shadow-md overflow-hidden cursor-col-resize select-none"
        style={{ aspectRatio: "16 / 9" }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <img
          src={beforeUrl}
          alt="Before"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          draggable={false}
        />

        <div
          className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none"
          style={{ width: `${sliderPosition}%` }}
        >
          <img
            src={afterUrl}
            alt="After"
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              width: `${100}%`,
              marginLeft: `-${100 - sliderPosition}%`,
            }}
            draggable={false}
          />
        </div>

        <div
          className="absolute top-0 bottom-0 w-1 bg-white shadow-lg transition-none pointer-events-none"
          style={{ left: `${sliderPosition}%` }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-2 shadow-lg">
            <svg
              className="w-4 h-4 text-muted-foreground"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14M16 5v14" strokeWidth="2" stroke="currentColor" fill="none" />
            </svg>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-4 py-3 bg-gradient-to-t from-black/50 to-transparent text-white text-xs">
          <div className="flex flex-col">
            <span className="font-semibold">Before</span>
            {beforeDate && <span className="opacity-75">{formatDate(beforeDate)}</span>}
          </div>
          <div className="flex flex-col items-end">
            <span className="font-semibold">After</span>
            {afterDate && <span className="opacity-75">{formatDate(afterDate)}</span>}
          </div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground text-center">
        Drag slider to compare
      </div>
    </div>
  );
}
