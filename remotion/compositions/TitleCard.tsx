// remotion/compositions/TitleCard.tsx
//
// Branded title/outro card. Useful on its own, and as the opening or closing
// beat around a generated clip.

import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily, theme } from "../theme";

// Plain props rather than a Remotion zod `schema`: Remotion 4.0.5xx requires
// zod v4 and this app is on zod v3 (see docs/kie-remotion.md). Props are still
// editable per-render via --props on the CLI.
//
// Declared as a type alias, not an interface — <Composition> requires props to
// be assignable to Record<string, unknown>, and only type aliases get an
// implicit index signature.
export type TitleCardProps = {
  headline: string;
  subhead: string;
  /** Small line above the headline — clinic name, campaign, or category. */
  eyebrow: string;
};

export const TitleCard: React.FC<TitleCardProps> = ({ headline, subhead, eyebrow }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Each line springs up slightly after the one above it.
  const rise = (delay: number) =>
    spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 30 });

  // Hold at full opacity, then fade over the last 15 frames.
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.ink,
        fontFamily,
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
        opacity: fadeOut,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 1400 }}>
        <div
          style={{
            color: theme.primary,
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: 6,
            textTransform: "uppercase",
            opacity: rise(0),
            transform: `translateY(${(1 - rise(0)) * 24}px)`,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            color: theme.white,
            fontSize: 96,
            fontWeight: 700,
            lineHeight: 1.1,
            marginTop: 28,
            opacity: rise(6),
            transform: `translateY(${(1 - rise(6)) * 24}px)`,
          }}
        >
          {headline}
        </div>
        <div
          style={{
            color: theme.muted,
            fontSize: 40,
            lineHeight: 1.4,
            marginTop: 28,
            opacity: rise(12),
            transform: `translateY(${(1 - rise(12)) * 24}px)`,
          }}
        >
          {subhead}
        </div>
      </div>
    </AbsoluteFill>
  );
};
