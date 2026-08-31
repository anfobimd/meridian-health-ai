// src/integrations/kie/models.ts
//
// Model identifiers for the kie.ai unified jobs API.
//
// This is a shortlist, not the full catalogue — kie.ai adds models regularly
// and any string its API accepts works here. Browse the current list and each
// model's `input` schema at https://kie.ai (API docs -> Market / Common API).
//
// NOTE: a few older kie.ai products (Veo3, Suno, Midjourney, Flux Kontext,
// Runway Aleph) have their own dedicated endpoints rather than /jobs/createTask.
// The kie-generate edge function speaks the unified jobs API only; using one of
// those requires adding an action for its endpoint.

export const KIE_IMAGE_MODELS = {
  nanoBanana: "nano-banana-2",
  zImage: "z-image",
  grokImage: "grok-imagine-image-2-0/text-to-image",
  topazUpscale: "topaz/image-upscale",
} as const;

export const KIE_VIDEO_MODELS = {
  seedance: "bytedance/seedance-2-5",
  minimaxTextToVideo: "minimax-h3/text-to-video",
  wanTextToVideo: "wan/2-7-text-to-video",
  wanImageToVideo: "wan/2-7-image-to-video",
} as const;

export const KIE_AUDIO_MODELS = {
  soundEffect: "elevenlabs/sound-effect-v2",
} as const;
