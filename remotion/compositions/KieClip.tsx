// remotion/compositions/KieClip.tsx
//
// Wraps a single asset produced by kie.ai (see supabase/functions/kie-generate)
// in branded framing: a caption lower-third over a scrim, plus fades at both
// ends.
//
// Feed it a result URL straight from the kie.ai task payload:
//
//   const { resultUrls } = await getKieTask(taskId);
//   <Player component={KieClip} inputProps={{ assetUrl: resultUrls[0], ... }} />
//
// Stills are given a slow Ken Burns push so a generated image still reads as
// motion footage.

import React from "react";
import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Img,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fontFamily, theme } from "../theme";

// Plain props rather than a Remotion zod `schema` — see the note in TitleCard.tsx.
export type KieClipProps = {
  /** Absolute URL of the generated asset. kie.ai result URLs are public CDN links. */
  assetUrl: string;
  assetKind: "video" | "image";
  /** Lower-third caption. Empty string hides the caption entirely. */
  caption: string;
  /** Drives durationInFrames via calculateMetadata below. */
  durationInSeconds: number;
};

/**
 * Lets the clip length be edited as seconds in the Studio sidebar instead of
 * being hard-coded as frames on the <Composition>.
 */
export const calculateKieClipMetadata: CalculateMetadataFunction<KieClipProps> = ({ props }) => ({
  durationInFrames: Math.max(1, Math.round(props.durationInSeconds * 30)),
});

export const KieClip: React.FC<KieClipProps> = ({ assetUrl, assetKind, caption }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fade = interpolate(
    frame,
    [0, 12, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Stills only: 1.0 -> 1.08 push across the whole clip.
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.08], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: theme.ink, opacity: fade }}>
      {assetKind === "video" ? (
        <OffthreadVideo src={assetUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <Img
          src={assetUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${zoom})`,
          }}
        />
      )}

      {caption ? (
        <AbsoluteFill style={{ justifyContent: "flex-end" }}>
          {/* Scrim so the caption stays legible over bright footage. */}
          <div
            style={{
              background: `linear-gradient(to top, ${theme.ink}f2 0%, ${theme.ink}00 100%)`,
              padding: "160px 80px 80px",
            }}
          >
            <div
              style={{
                borderLeft: `8px solid ${theme.primary}`,
                paddingLeft: 32,
                color: theme.white,
                fontFamily,
                fontSize: 52,
                fontWeight: 600,
                lineHeight: 1.25,
                maxWidth: 1500,
              }}
            >
              {caption}
            </div>
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
