# kie.ai + Remotion

Two independent pieces that are designed to meet in the middle: **kie.ai**
generates raw media (video, images, audio) from prompts, and **Remotion**
composes that media into a finished, branded MP4 using React.

```
prompt ──▶ kie-generate edge function ──▶ kie.ai ──▶ result URL
                                                        │
                                                        ▼
                                        Remotion composition ──▶ MP4
```

---

## kie.ai

### What was added

| Path | Purpose |
| --- | --- |
| `supabase/functions/kie-generate/index.ts` | Server-side proxy. Holds the API key, requires an authenticated caller. |
| `src/integrations/kie/client.ts` | Typed browser client — `createKieTask`, `getKieTask`, `waitForKieTask`. |
| `src/integrations/kie/models.ts` | Shortlist of model identifiers. |
| `src/hooks/useKieGeneration.ts` | React Query hook with live progress state. |

There is no official kie.ai npm SDK — it is a REST API, so the integration is
hand-rolled rather than installed from the registry.

### Setup

1. Create an API key at <https://kie.ai> (API Key Management).
2. Store it as a Supabase secret — it must never reach the browser:

   ```bash
   supabase secrets set KIE_API_KEY=your-key
   ```

3. Deploy the function:

   ```bash
   supabase functions deploy kie-generate
   ```

### Using it

```tsx
import { useKieGeneration } from "@/hooks/useKieGeneration";
import { KIE_VIDEO_MODELS } from "@/integrations/kie/models";

const { generate, state, resultUrls } = useKieGeneration();

await generate.mutateAsync({
  model: KIE_VIDEO_MODELS.seedance,
  input: { prompt: "calm treatment room, soft morning light", aspect_ratio: "16:9" },
});
```

`state` moves through `waiting → queuing → generating → success | fail`.
Generations take tens of seconds to several minutes, so drive progress UI off
`state` rather than `generate.isPending`.

### How the API behaves

- `POST /api/v1/jobs/createTask` with `{ model, input, callBackUrl? }` returns a
  `taskId` immediately. Nothing has rendered yet.
- `GET /api/v1/jobs/recordInfo?taskId=…` reports `state`, and on success a
  `resultJson` string containing `resultUrls`. The edge function parses that and
  returns a plain `resultUrls: string[]`.
- Errors come back as HTTP 200 with a non-200 `code` in the envelope, which the
  edge function unwraps and rethrows.

Prefer `callBackUrl` over polling for long jobs if you add a webhook endpoint —
kie.ai will POST the result rather than making the client wait.

### Known limits of this integration

- **Unified jobs API only.** A few older kie.ai products (Veo3, Suno,
  Midjourney, Flux Kontext, Runway Aleph) use their own endpoints
  (`/veo/generate`, `/generate/record-info`, …). Supporting one means adding an
  action to `kie-generate` for its endpoint.
- **No task persistence.** Tasks are not written to Postgres, so a page reload
  loses the in-flight task id. Add a `kie_tasks` table if generations need to
  survive reloads or be audited.
- **`input` is model-specific and unvalidated.** Each model accepts a different
  payload; check the model's docs on kie.ai. The proxy passes `input` through
  untouched.
- **Every call costs credits.** The function requires a signed-in user, but
  there is no per-user rate limit or quota — worth adding before exposing this
  to patients rather than staff.

---

## Remotion

### What was added

| Path | Purpose |
| --- | --- |
| `remotion/index.ts` | Bundle entry point (`registerRoot`). |
| `remotion/Root.tsx` | Composition registry — add new compositions here. |
| `remotion/compositions/TitleCard.tsx` | Branded title/outro card. |
| `remotion/compositions/KieClip.tsx` | Frames a kie.ai asset with a caption and fades. |
| `remotion/theme.ts` | Brand hex values (Remotion has no access to Tailwind or `index.css`). |
| `remotion.config.ts` | CLI/Studio config. Does not affect the Vite build. |

Packages: `remotion` and `@remotion/player` (dependencies), `@remotion/cli`
(dev dependency).

### Commands

```bash
npm run remotion:studio                       # visual editor at localhost:3000
npm run remotion:render -- TitleCard out/title.mp4
npm run remotion:render -- KieClip out/clip.mp4 \
  --props='{"assetUrl":"https://…","assetKind":"video","caption":"…","durationInSeconds":8}'
```

The first render downloads a headless Chrome build (~150 MB) into
`node_modules/.remotion`.

### Previewing inside the app

`@remotion/player` renders a composition in the React app with no server-side
rendering:

```tsx
import { Player } from "@remotion/player";
import { KieClip } from "../../remotion/compositions/KieClip";

<Player
  component={KieClip}
  durationInFrames={240}
  fps={30}
  compositionWidth={1920}
  compositionHeight={1080}
  controls
  style={{ width: "100%" }}
  inputProps={{
    assetUrl: resultUrls[0],
    assetKind: "video",
    caption: "Generated with kie.ai",
    durationInSeconds: 8,
  }}
/>
```

### Known warnings

- **`Version mismatch: zod installed 3.25.76, required 4.4.3`** on every CLI
  command. Remotion 4.0.5xx pairs with zod v4 for its `schema` prop; this app is
  on zod v3 and upgrading it is a breaking change across every form. The
  compositions therefore declare plain TypeScript props instead of a zod schema,
  so the warning is cosmetic — bundling, `compositions`, `still` and `render`
  all verified working. The cost is that Remotion Studio shows no generated
  props editor; override props with `--props` on the CLI instead.
- Props types must be **type aliases, not interfaces**. `<Composition>` requires
  props assignable to `Record<string, unknown>`, and only type aliases get an
  implicit index signature.

### Notes

- Compositions use inline styles, not Tailwind. Remotion bundles with its own
  webpack config and does not load `src/index.css`, so the palette is mirrored
  by hand in `remotion/theme.ts` — update it if the brand colours change.
- Rendering an MP4 requires a Node process with Chrome; it cannot happen in the
  browser. To render server-side, use `@remotion/renderer` in a Node service or
  Remotion Lambda. Supabase edge functions run on Deno and cannot do it.

### Licensing — read before shipping

Remotion is **not** MIT licensed. It is free for individuals and for companies
with up to three employees; larger companies need a paid company licence.
Check <https://remotion.pro/license> against the company's headcount before
this reaches production — this applies to the whole project, not just the
Remotion files.
