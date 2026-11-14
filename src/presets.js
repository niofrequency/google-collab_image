// Built-in presets. Each group starts with "Default": the settings that group started with before presets existed.
// Edit the numbers here to change what a preset button sets.

// Image Generator — keyed by the backend's model_type ("sdxl" = BigLust, "qwen_image_edit" = Qwen edit).
// s: settings it sets. loraStrength sets every LoRA in use; maxSide shrinks Width/Height (keeping the shape).
export const GENERATOR_PRESETS = {
  sdxl: [
    {
      name: 'Default',
      info: 'The standard BigLust settings: 832×1216, 25 steps, CFG 4.5, no face fix.',
      s: { width: 832, height: 1216, steps: 25, cfg: 4.5, sampler: 'dpmpp_2m', scheduler: 'karras', denoise: 1, batch: 1, faceFix: false, faceStrength: 0.4, loraStrength: 0.8 },
    },
    {
      name: 'Portrait (best likeness)',
      info: 'Square close-up with face fix — the best way to make a person LoRA look like the person. Put "close-up portrait" and the trigger word in the prompt.',
      s: { width: 1024, height: 1024, steps: 30, cfg: 4.5, sampler: 'dpmpp_2m', scheduler: 'karras', denoise: 1, batch: 1, faceFix: true, faceStrength: 0.4, loraStrength: 0.9 },
    },
    {
      name: 'Upper body',
      info: 'Waist-up, portrait shape, face fix on. Good balance of outfit and face detail.',
      s: { width: 896, height: 1152, steps: 30, cfg: 4.5, sampler: 'dpmpp_2m', scheduler: 'karras', denoise: 1, batch: 1, faceFix: true, faceStrength: 0.4, loraStrength: 0.9 },
    },
    {
      name: 'Full body',
      info: 'Tall image for full-body shots. The face is small here, so face fix is stronger.',
      s: { width: 832, height: 1216, steps: 30, cfg: 4.5, sampler: 'dpmpp_2m', scheduler: 'karras', denoise: 1, batch: 1, faceFix: true, faceStrength: 0.45, loraStrength: 0.9 },
    },
    {
      name: 'Landscape',
      info: 'Wide image (scenes, lying poses, groups), face fix on.',
      s: { width: 1216, height: 832, steps: 30, cfg: 4.5, sampler: 'dpmpp_2m', scheduler: 'karras', denoise: 1, batch: 1, faceFix: true, faceStrength: 0.4, loraStrength: 0.9 },
    },
    {
      name: 'Fast draft',
      info: 'Smaller and fewer steps (about twice as fast) to try prompts quickly. No face fix.',
      s: { width: 768, height: 1024, steps: 18, cfg: 4.5, sampler: 'dpmpp_2m', scheduler: 'karras', denoise: 1, batch: 1, faceFix: false, faceStrength: 0.4, loraStrength: 0.8 },
    },
  ],
  qwen_image_edit: [
    {
      name: 'Default',
      info: 'Rapid AIO recommended settings: 4 steps, CFG 1, sa_solver / beta, full redraw. Keeps Picture 1\'s size.',
      s: { steps: 4, cfg: 1, sampler: 'sa_solver', scheduler: 'beta', denoise: 1, batch: 1, loraStrength: 0.8 },
    },
    {
      name: 'Keep face (subtle edit)',
      info: 'Keeps more of Picture 1, faces included (denoise 0.75). Also write "keep the face unchanged" in the prompt. Lower the denoise if the face still changes; raise it if the edit doesn\'t happen.',
      s: { steps: 4, cfg: 1, sampler: 'sa_solver', scheduler: 'beta', denoise: 0.75, batch: 1, loraStrength: 0.8 },
    },
    {
      name: 'More detail (6 steps)',
      info: '6 steps instead of 4: a bit more detail, about 50% slower.',
      s: { steps: 6, cfg: 1, sampler: 'sa_solver', scheduler: 'beta', denoise: 1, batch: 1, loraStrength: 0.8 },
    },
    {
      name: 'Fast (smaller)',
      info: 'Shrinks Width/Height so the longest side is 768 (same shape) — about twice as fast.',
      s: { steps: 4, cfg: 1, sampler: 'sa_solver', scheduler: 'beta', denoise: 1, batch: 1, maxSide: 768 },
    },
  ],
}

// Tags that describe what a person always looks like. For a person LoRA these are left out of the captions,
// so the trigger word learns them (otherwise you'd have to type them in every prompt).
export const PERSON_EXCLUDE_TAGS = [
  '1girl', '1boy', 'solo', 'realistic', 'photorealistic', 'lips', 'nose', 'eyelashes',
  'black hair', 'brown hair', 'blonde hair', 'red hair', 'grey hair', 'long hair', 'short hair', 'medium hair',
  'brown eyes', 'blue eyes', 'green eyes', 'grey eyes', 'black eyes', 'freckles', 'mole',
].join(', ')

// LoRA Training tab. s: training settings; tag: auto-tag settings; classWord: optional.
export const TRAINING_PRESETS = [
  {
    name: 'Default',
    info: 'Balanced settings for 15–40 images on a free T4 (1,500 steps, dim 8). Auto-tag adds tags at sensitivity 0.35.',
    s: { max_train_steps: 1500, train_batch_size: 2, resolution: 1024, network_dim: 8, network_alpha: 4, learning_rate: 0.0003, num_repeats: 10 },
    tag: { threshold: 0.35, mode: 'append', exclude: '' },
  },
  {
    name: 'Person / face',
    info: 'For a LoRA of one person: more capacity and steps for facial detail (2,000 steps, dim 16, ~30% longer). Auto-tag replaces captions and leaves out tags for things that never change (hair, eye colour…) so the trigger word learns them. Use mostly clear face photos. Use a new LoRA name if this name already has saved progress.',
    s: { max_train_steps: 2000, train_batch_size: 2, resolution: 1024, network_dim: 16, network_alpha: 8, learning_rate: 0.0002, num_repeats: 10 },
    tag: { threshold: 0.4, mode: 'replace', exclude: PERSON_EXCLUDE_TAGS },
  },
  {
    name: 'Style',
    info: 'For an art or photo style. Auto-tag describes the content in detail (sensitivity 0.3 → more tags) so the LoRA learns the look rather than the subjects. Sets the class word to "style".',
    s: { max_train_steps: 1500, train_batch_size: 2, resolution: 1024, network_dim: 16, network_alpha: 8, learning_rate: 0.0002, num_repeats: 10 },
    tag: { threshold: 0.3, mode: 'replace', exclude: '' },
    classWord: 'style',
  },
  {
    name: 'Quick test',
    info: 'Short run at 768 px (600 steps, roughly 20–30 minutes) to check your images and tags before a full training. Use a different name from your real LoRA.',
    s: { max_train_steps: 600, train_batch_size: 2, resolution: 768, network_dim: 8, network_alpha: 4, learning_rate: 0.0003, num_repeats: 10 },
    tag: { threshold: 0.35, mode: 'append', exclude: '' },
  },
]
