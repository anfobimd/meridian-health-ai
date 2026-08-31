// remotion/Root.tsx
//
// Composition registry for Remotion Studio and `remotion render`.
// Add new compositions here; the id is what you pass on the CLI:
//
//   npm run remotion:render -- TitleCard out/title.mp4

import React from "react";
import { Composition } from "remotion";
import { KieClip, calculateKieClipMetadata } from "./compositions/KieClip";
import { TitleCard } from "./compositions/TitleCard";

const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TitleCard"
        component={TitleCard}
        durationInFrames={4 * FPS}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          eyebrow: "Meridian Wellness",
          headline: "Your care, mapped end to end",
          subhead: "Booking, charting, and follow-up in one place.",
        }}
      />

      <Composition
        id="KieClip"
        component={KieClip}
        calculateMetadata={calculateKieClipMetadata}
        // Overridden by calculateMetadata; kept as the pre-calculation fallback.
        durationInFrames={8 * FPS}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{
          // Replace with a kie.ai result URL — see docs/kie-remotion.md.
          assetUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
          assetKind: "video" as const,
          caption: "Swap assetUrl for a kie.ai result URL",
          durationInSeconds: 8,
        }}
      />
    </>
  );
};
