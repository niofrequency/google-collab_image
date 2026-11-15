# Google Colab Image Generator

Google Colab notebooks for generating and editing images, making videos and music, and training LoRAs with
ComfyUI, plus a website (**ARX Image Generator**) that controls them.

- **Website:** https://google-collabimage-one.vercel.app
- **Repository:** https://github.com/niofrequency/google-collab_image

Each notebook prints a `READY:` URL; paste it into the matching tab on the website. Most run on Colab's **free T4**;
some need (or get much better on) a paid **L4** or **A100** — see the table below.

## Which GPU should I use?

Pick the GPU in Colab under **Runtime → Change runtime type**. The notebooks detect the GPU and **choose the best
model size for it automatically** — this is what each one uses:

| Notebook (website tab) | **T4** — free / cheapest, 15 GB | **L4** — paid, 24 GB ⭐ best value | **A100** — paid, 40 GB |
|---|---|---|---|
| **BigLust** (Image Generator) | ✅ BigLust SDXL | ✅ same model, ~2–3× faster; refiner at 2× runs comfortably | ✅ fastest |
| **Qwen Image Edit Rapid AIO** (Image Generator) | ✅ **Q2_K** (7.4 GB) | ✅ **Q4_K** (13.3 GB) — better quality | ✅ **Q8_0** (21.8 GB) — best quality |
| **Image to Video — Wan 2.2 A14B** (Image to Video) | ❌ too big — use the 5B notebook | ✅ **A14B Q4_K_M**, 480p default | ✅ **A14B Q8_0**, 720p default |
| **Image to Video — Wan 2.2 5B** (Image to Video) | ✅ **TI2V 5B Q8_0** + Turbo LoRA (slow-ish; start with 480p, 2–3 s) | ✅ same model, faster | ✅ same model, faster |
| **Music — ACE-Step 1.5** (Music) | ✅ **turbo** + 1.7B planner (runs in fp32: slower), up to 3 min | ✅ **XL turbo** + 1.7B planner, up to 4 min | ✅ **XL turbo** + **4B** planner, up to 4 min |
| **SDXL LoRA training** (LoRA Training) | ✅ *standard* mode (fp16, image model only) | ✅ *improved* mode (bf16 + text encoder trained), 2–3× faster | ✅ *improved* mode, fastest |

**Quick guide**
- **No compute units / free tier → T4.** Everything except the A14B video notebook works; video and music are slower.
- **You have compute units → L4** for almost everything: much faster, and the Qwen, video and music notebooks switch
  to bigger, better-quality models by themselves.
- **A100** only for heavy jobs (720p video, the biggest models, long training) — it uses compute units several times
  faster than an L4.
- **Don't pick** CPU, TPU (v5e / v6e) or the G4 GPU — the notebooks need an NVIDIA GPU and haven't been tested on G4.
- Run **one GPU notebook at a time**, and use **Runtime → Disconnect and delete runtime** when you're done so idle time
  doesn't use units.
- On the Qwen notebook you can also switch the model size from the website (**Model size** dropdown); sizes too big
  for your GPU are marked, with a note on how to switch to a bigger GPU.

The older notebooks at the bottom of the notebook list (Into Realism, Krea 2, Qwen Image Edit 2511, Wan 2.1) haven't
been updated with GPU detection; they were made for the T4 (Qwen 2511 fp8 is likely too big for it).

## Notebooks

| Notebook | What it does | Open in Colab |
|---|---|---|
| **BigLust** (SDXL) | Text-to-image with BigLust or any SDXL checkpoint, with LoRAs. Download checkpoints/LoRAs from the website. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/BIGLUST.ipynb) |
| **Qwen Image Edit Rapid AIO** (GGUF) | Edits photos from a text instruction, up to 3 reference images, with Qwen LoRAs. Also text-to-image. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/QWEN-AIO-NSFW-EDIT.ipynb) |
| **Image to Video — Wan 2.2 A14B** (best) | Animates a still image into a short video (up to ~7.5 s). Needs an **L4 or A100**. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/IMG2VID-WAN22-A14B.ipynb) |
| **Image to Video — Wan 2.2 5B** (free T4) | Same, with a smaller model that fits the **free T4** (up to 5 s, lower quality). | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/IMG2VID-WAN22-5B-FREE.ipynb) |
| **Music — ACE-Step 1.5** | Songs with vocals and lyrics, or instrumentals, from a style description. Free T4 or better. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/MUSIC-ACESTEP.ipynb) |
| **SDXL LoRA training** | Trains your own SDXL LoRA from 15–40 images, controlled from the website's LoRA Training tab. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/SDXL-LORA-TRAINING.ipynb) |
| Into Realism (SDXL) | Older SDXL text-to-image notebook with a website server. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/INTO-REALISM.ipynb) |
| Krea 2 Realism | Older Krea 2 text-to-image notebook with a website server. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/KREA2.ipynb) |
| Qwen Image Edit 2511 (fp8) | Older notebook with the official Qwen-Image-Edit-2511 fp8 model (~20 GB, likely too big for a free T4; uses ngrok). | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/QWEN-2511-IMAGE-EDIT.ipynb) |
| Wan 2.1 (GGUF) | Text-to-image with Wan 2.1 14B inside the notebook (no website server). | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/Wan2.1_T2I_jupyter.ipynb) |

Direct links:
- BigLust: https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/BIGLUST.ipynb
- Qwen Image Edit Rapid AIO: https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/QWEN-AIO-NSFW-EDIT.ipynb
- Image to Video (A14B, L4/A100): https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/IMG2VID-WAN22-A14B.ipynb
- Image to Video (5B, free T4): https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/IMG2VID-WAN22-5B-FREE.ipynb
- Music (ACE-Step 1.5): https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/MUSIC-ACESTEP.ipynb
- SDXL LoRA training: https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/SDXL-LORA-TRAINING.ipynb
- Into Realism: https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/INTO-REALISM.ipynb
- Krea 2 Realism: https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/KREA2.ipynb
- Qwen Image Edit 2511: https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/QWEN-2511-IMAGE-EDIT.ipynb
- Wan 2.1: https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/Wan2.1_T2I_jupyter.ipynb

## Quick start

1. Open a notebook with its **Open in Colab** button.
2. **Runtime → Change runtime type → T4 GPU.**
3. Run the cells in order (see each notebook below). The first cell asks for **Google Drive** access — allow it
   (LoRAs and training images are kept there).
4. Copy the `READY: https://….trycloudflare.com` URL the notebook prints.
5. Open the [website](https://google-collabimage-one.vercel.app) and paste the URL:
   - **Image Generator** tab → *Backend URL* (BigLust, Qwen, Into Realism, Krea 2)
   - **Image to Video** tab → *Video server URL* (IMG2VID notebooks)
   - **Music** tab → *Music server URL* (MUSIC-ACESTEP)
   - **LoRA Training** tab → *Training server URL* (SDXL LoRA training)

Run **one GPU notebook at a time** — on the free tier they share one GPU.

## BigLust (SDXL)

[Open in Colab](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/BIGLUST.ipynb) ·
Run cells **1–3** (or *Run all*); cell 3 prints the URL once BigLust has loaded. Cell 4 shows the server's log and memory use.

- **Checkpoints and LoRAs from the website:** *+ Download Checkpoint* / *+ Download LoRA*, then paste a link:
  - Civitai model pages (`https://civitai.com/models/12345/...` — newest version, or the one in `?modelVersionId=`)
  - Civitai download links (`https://civitai.com/api/download/models/67890`)
  - Hugging Face file links (`.../blob/main/model.safetensors` or `.../resolve/main/...`)

  Downloads run in the background with progress shown. A new checkpoint is selected and a new LoRA is enabled at
  strength 0.8 automatically. Use SDXL-based checkpoints (SDXL, Pony, Illustrious, …) with SDXL LoRAs.
- **Checkpoint dropdown / "Use a downloaded LoRA"** list everything in the runtime's `models/checkpoints` and
  `models/loras` folders.
- **LoRAs are kept in Google Drive** (`MyDrive/ComfyUI/loras_sdxl`), including LoRAs you train with the training
  notebook. Checkpoints stay on the runtime and must be downloaded again after it's deleted.
- One checkpoint is loaded at a time; switching frees the previous one.
- **Face fix** (toggle under the settings): after the image is made, each face is found, redrawn at full resolution
  with your LoRAs and prompt, and blended back in (like ADetailer). Faces — especially small ones in full-body shots —
  get much more detail and look more like a person LoRA. *Strength* 0.3 = subtle, 0.4 = default, 0.5–0.6 = stronger.
- **Refiner** (toggle under the settings): a second pass for better quality ("hires fix") — the finished image is
  enlarged (1.5× by default, max 2048 px) and lightly redrawn (strength 0.3), adding sharper detail and cleaner skin
  and textures. *Refiner model*: **Same as main model** (fastest, keeps your LoRAs) or any SDXL checkpoint — paste a
  Civitai / Hugging Face link under **+ Download refiner**. A different refiner is loaded in place of the main model, so
  it's slower and its pass doesn't use your LoRAs.
- **Where each LoRA is used** (dropdown on each LoRA): *Whole image*, *Main image only* or *Face fix only*. For the
  best likeness, put a full-body LoRA (e.g. `Stephanie_v1`) on *Main image only* and a LoRA trained only on face
  close-ups (e.g. `Stephanie_face`) on *Face fix only*, with Face fix on and the same trigger word in the prompt:
  the body comes from the first LoRA, the face from the second.
- **Face reference** (toggle under Face fix): keeps **the same face** in every image from 1–3 pictures — no training
  (IP-Adapter FaceID Plus v2, used in the main image and in face fix). Made for **comics and short films**:
  1. Generate a character you like (or upload clear, front-facing face pictures — head-and-shoulders works best).
  2. In the full-size viewer press **Use as face** (up to 3 pictures; different angles help).
  3. Press **+ Save as character** and give it a name. Saved characters stay in your browser — click one to use it
     for each panel or shot. For a film, make each shot's start frame this way, then animate it in **Image to Video**.

  Works with any **SDXL-based** checkpoint (BigLust, Juggernaut, RealVis, Pony, Illustrious…) — best likeness on
  photo-style models; not SD 1.5. *Strength* 0.6 light · **0.8 default** · 1.0–1.2 strong likeness (can look stiff).
  It copies the face only —
  describe hair, body and clothes in the prompt, or combine it with a LoRA. Only use pictures of real people who have
  agreed to it.
- **Presets:** one click sets size, steps, CFG, sampler, face fix, face reference and LoRA strength — *Default*,
  *Portrait (best likeness)*, *Upper body*, *Full body*, *Landscape*, *Character (face reference)*, *Character –
  strong likeness*, *Fast draft*. Save your own with *+ Save current as preset*
  (kept in your browser). Presets don't change your prompt.

## Qwen Image Edit Rapid AIO (GGUF)

[Open in Colab](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/QWEN-AIO-NSFW-EDIT.ipynb) ·
Run cells **1–3**; cell 3 prints the URL once the models have loaded. Cell 4 shows the server's log and memory use. Model: [Qwen-Rapid-NSFW-v23 Q2_K](https://huggingface.co/Novice25/Qwen-Image-Edit-Rapid-AIO-GGUF)
with the Qwen2.5-VL 7B Q4_K_M text encoder (small enough for the free T4).

- Pasting the URL switches the website to the recommended settings: **4 steps, CFG 1, `sa_solver` / `beta`**.
- **Reference images (up to 3):** paste (Ctrl+V), drag & drop, upload or paste an image address. **Picture 1** is
  the image being edited and sets Width/Height to its size (change them for a different output size; the output is
  exactly Width × Height and the photo is never stretched). **Pictures 2–3** are extra references — refer to them in
  the prompt, e.g. *"put the person from Picture 1 in the outfit from Picture 2"*. Each extra picture is slower.
  No reference image = text-to-image.
- **Faster:** lower Width/Height (e.g. 768 × 768). Re-rolls with the same prompt and image reuse the encoding.
- **Keeping faces:** Denoise 0.7–0.85, same shape as the photo, and *"keep the face unchanged"* in the prompt.
- **Presets:** *Default*, *Keep face (subtle edit)*, *More detail (6 steps)*, *Fast (smaller)*, plus your own.
- **Model size** (dropdown on the website): the same v23 model in sizes Q2_K (7.4 GB) to Q8_0 (21.8 GB) — bigger means
  better quality but needs a bigger GPU. Cell 1 picks the best size for the Colab GPU automatically:

  | Colab GPU | GPU memory | Sizes that fit | Picked automatically |
  |---|---|---|---|
  | T4 (free) | 15 GB | Q2_K | Q2_K |
  | L4 | 24 GB | Q2_K – Q5_K | Q4_K |
  | A100 | 40 GB | all | Q8_0 |

  Picking another size on the website downloads it (first time) and loads it. If a size is too big for the current GPU,
  the website says so and explains how to switch to a bigger GPU (**Runtime → Change runtime type → L4 / A100**, which
  needs Colab Pro or compute units).
- **LoRAs:** *+ Download LoRA* on the website. Only **Qwen-Image / Qwen-Image-Edit** LoRAs work; they're kept in
  `MyDrive/ComfyUI/loras_qwen`. Each LoRA adds some time per image.
- Re-running cell 3 restarts the server with the current code (same URL). To stop it: **Runtime → Restart session**.

## Image to Video (Wan 2.2)

Two notebooks, same website tab (**Image to Video**). Run cells **1–3**; cell 3 prints the URL.

| Notebook | Model | GPU | Clip length | Notes |
|---|---|---|---|---|
| [IMG2VID-WAN22-A14B](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/IMG2VID-WAN22-A14B.ipynb) | Wan 2.2 I2V A14B (GGUF Q4_K_M on L4, Q8_0 on A100) + 4-step Lightning LoRAs | L4 / A100 | up to ~7.5 s, 16 fps | best quality |
| [IMG2VID-WAN22-5B-FREE](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/IMG2VID-WAN22-5B-FREE.ipynb) | Wan 2.2 TI2V 5B (GGUF Q8_0) + 4-step Turbo LoRA | free T4 | up to 5 s, 24 fps | slower, lower quality |

On the tab: add a **start image** (paste, drag & drop, file or image address), describe the **motion** ("she turns
toward the camera and smiles, slow push-in"), pick a preset (*Default*, *Quick preview*, *Longer clip*, *HD (720p)*,
*Best quality (slow)*) and press **Generate video**. *Fast* mode uses the 4-step LoRAs; *Quality* uses 20 steps (about 5×
slower). Finished videos play on the page, are kept in your browser's gallery, and can be downloaded as MP4. Models
come from Hugging Face: QuantStack (Wan 2.2 GGUF), Comfy-Org (Lightning LoRAs, VAE), Kijai (5B Turbo LoRA), city96 (text
encoder).

### Keeping a character consistent (short films)

- **Start from your character:** make each shot's first frame in the Image Generator with a saved **character**
  (Face reference), then in the full-size viewer press **Video start** — it opens here with the picture loaded.
- **End image** (A14B notebook only): also press **Video end** on a second picture of the same character (or drop one
  in *End image*). Wan fills in the motion between the two, so the face is fixed at both ends and can't drift far.
  Plan shots like "Mia at the door" → "Mia sitting at the table"; keep the place, clothes and framing similar. The end
  image is cropped to the start image's shape. The free 5B notebook has no end image.
- **Continue from last frame** (under the finished video, in the viewer and in Info): the exact last frame becomes the
  next clip's start image, so longer scenes join up without the character changing between clips.
- Within a clip: close-up / medium shots, one simple action per clip, 3–5 s, and 720p or *Best quality* keep faces
  steadier than fast spins or tiny faces.

### Sound (MMAudio)

Turn on **🔇 Add sound** (under Size / Length / Mode) to give the video matching sound effects and ambience —
footsteps, waves, wind, rain, engines, animals, crowds — timed to what happens on screen. It uses
[MMAudio](https://github.com/hkchengrex/MMAudio) (large 44.1 kHz model) after the video is made, and adds about a
minute per clip (more on a T4). It doesn't make speech or music; for music use the **Music** tab.

- **Sound description** (optional): what it should sound like, e.g. *"ocean waves crashing, seagulls"*. Empty = the
  motion prompt is used.
- Cell 1 installs it (~8 GB extra download). Set `ADD_SOUND = False` at the sound section of cell 1 to skip it.
- If adding sound fails (e.g. out of memory), you still get the silent video and the website says why.
- Videos with sound show 🔊 in the gallery and play with sound in the viewer.
- MMAudio's model weights are licensed **CC BY-NC 4.0** — non-commercial use only.

The video gallery works like the image gallery: hover to play, click to select (delete several at once), magnifier
or double-click for the full-size viewer (← → to browse, Esc to close, Download / Use prompt / Info / Delete), a
**Size** slider, and **Full videos** to show whole videos instead of cropped tiles.

## Music (ACE-Step 1.5)

[Open in Colab](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/MUSIC-ACESTEP.ipynb) ·
Run cells **1–3**; cell 3 prints the URL for the website's **Music** tab. Models from
[Comfy-Org/ACE-Step-1.5](https://huggingface.co/Comfy-Org/ACE-Step-1.5) (MIT license), picked for the GPU:

| GPU | Model | Song planner | Max length |
|---|---|---|---|
| T4 (free) | ACE-Step 1.5 turbo | 1.7B | 3 min (runs in fp32 on a T4: slower) |
| L4 | ACE-Step 1.5 **XL** turbo | 1.7B | 4 min |
| A100 | ACE-Step 1.5 **XL** turbo | 4B | 4 min |

On the tab: describe the **style** (genre, instruments, mood, voice), write **lyrics** with `[verse]` / `[chorus]` /
`[bridge]` sections (or turn on **Instrumental**), set length, BPM, key and language, pick a preset (*Default*, *Short
jingle*, *Full song*, *Instrumental*, *Fast draft*) and press **Generate song**. Songs play on the page, are kept in
your browser, and can be downloaded as MP3.

## SDXL LoRA training

[Open in Colab](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/SDXL-LORA-TRAINING.ipynb) ·
Uses [kohya-ss sd-scripts](https://github.com/kohya-ss/sd-scripts).

1. Run **cell 1** (setup, ~3 minutes) and **cell 2** — cell 2 prints the `READY:` URL.
2. On the website's **LoRA Training** tab: paste the URL, name the LoRA, pick a made-up **trigger word**
   (e.g. `zxq_anna` — you'll type it in prompts later) and a class word (`woman`, `man`, …).
3. Drop in **15–40 images** (varied poses, outfits, backgrounds; jpg/png/webp — convert iPhone HEIC to jpg).
4. Pick a **preset** for your kind of LoRA — *Default*, *Person / face*, *Style* or *Quick test*. It sets the training
   settings **and** the auto-tag settings (sensitivity, add/replace, and **tags to leave out**: for a person, things that
   never change like hair or eye colour are left out so the trigger word learns them).
   Check the tags under each image. **Auto-tag all** fills them in; **Tag for all images** adds/removes one tag everywhere.
5. Press **Start training**. Expect about **1–3 hours**; the website shows the step, % and time left. The first
   5–15 minutes are loading the model and preparing the images (step 0).
6. The finished LoRA is saved to `MyDrive/ComfyUI/loras_sdxl/<name>.safetensors` and appears in BigLust's LoRA list.

**GPU-aware training:** cell 1 detects the GPU. On a **T4** it trains in *standard* mode (fp16, image model only — what
fits 15 GB). On an **L4 or A100** it switches to *improved* mode automatically: **bf16** precision and the **text encoder
is trained too**, which usually ties the trigger word more strongly to the person; presets then use batch 4 with half
the steps (same amount of training, finished 2–3× sooner). The website shows the GPU and mode under the URL. A run
started on a T4 continues in standard mode; press *Start fresh* to retrain it in improved mode.

Every setting on the website has an **ⓘ** explaining it. Images and captions are stored in
`MyDrive/ComfyUI/training/<name>/images`; checkpoints every 250 steps in `.../<name>/output`. If Colab disconnects,
run cells 1–2 again and press Start training with the same name — it continues from the last saved step. If you get
*"CUDA out of memory"*, set Batch size to 1. Cell 3 trains without the website; cell 4 shows progress in Colab.

### Using your LoRA after training

You don't need to download anything. The LoRA is saved to your Google Drive, and BigLust picks it up automatically.

1. **Free the GPU.** In the training notebook: **Runtime → Disconnect and delete runtime**. Free Colab gives you one
   GPU, so BigLust can't run alongside the trainer.
2. **Start BigLust:** [open it from GitHub](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/BIGLUST.ipynb),
   choose a T4 GPU, and run all cells. Allow Drive access when asked; that's how it finds your LoRA in
   `MyDrive/ComfyUI/loras_sdxl`.
3. **On the [website](https://google-collabimage-one.vercel.app)**, **Image Generator** tab, paste BigLust's URL.
   In the **LoRAs** section, open **"+ Use a downloaded LoRA…"** and pick **`<name>.safetensors`**
   (e.g. `Stephanie.safetensors`).
4. **Put your trigger word in the prompt**, e.g. *"photo of Stephanie, smiling, in a café, natural light"*. Start at
   strength **0.8**: lower it if it looks overdone, raise it if the likeness is weak.

You only need to download it from Drive if you want to use it in some other program.

### Retraining from zero (e.g. with the Person / face preset)

Training again with the same name **continues** the saved run, which only works with the same settings. To retrain
from zero — for example a second version with the *Person / face* preset — press **Start fresh** on the LoRA Training
tab, then **Start training**. Nothing is deleted: the old run is moved to `training/<name>/output_v1` and the old LoRA is
renamed `<name>_v1.safetensors` (then v2, v3…), so you can compare both in BigLust. Your images and tags stay as they
are. Under the settings, the tab shows whether a name has saved progress.

### If training stops

Cell 4 alone won't restart it — cell 4 only *shows* progress. What to do depends on what stopped:

| What happened | What to do |
|---|---|
| **Colab disconnected** (new runtime, "Reconnect" message) | Run **cell 1**, then either **cell 2** (website) or **cell 3** (no website). See below. |
| **Training errored but Colab is still connected** | Just start training again (Start training on the website, or re-run cell 3). No need to re-run cell 1. |

**Resuming with the website:**
1. Run cell 1, then cell 2, and copy the **new** `READY:` URL; it changes every time.
2. On the **LoRA Training** tab, paste the new URL. Your name, trigger word and settings are remembered by your
   browser. If the name field is empty, click your LoRA's button (e.g. **Stephanie**) under the URL box.
3. Press **Start training**. It continues from the last save.

**Resuming without the website (cell 3):**
1. Run cell 1.
2. Run cell 3 again with the **same values** in the form: same name, trigger word and steps. Your images are already
   in Drive, so it skips the file picker and continues.

**Keep these the same when resuming:** the **name** and the **number of steps** (default 1,500). Progress after the
last save is redone. Saves happen every 250 steps, so you lose at most about 15–20 minutes at the default settings.

## Why generation no longer crashes the notebook

In the BigLust and Qwen notebooks, **cell 2 saves the generation server as its own program and cell 3 runs it
separately** from the notebook. If an image runs out of memory, only that program stops: cell 3 restarts it
automatically with the **same URL** (models reload in 1–3 minutes), and the website waits, then tells you the job was
lost and why. If it crashes 4 times within 10 minutes it stays stopped — check cell 4's log and run cell 3 again.
To lower the chance of crashes: smaller Width/Height, fewer reference pictures, batch 1, fewer LoRAs.

## Google Drive folders

| Folder | Contents |
|---|---|
| `MyDrive/ComfyUI/loras_sdxl` | SDXL LoRAs (downloaded in BigLust, or trained) |
| `MyDrive/ComfyUI/loras_qwen` | Qwen-Image-Edit LoRAs |
| `MyDrive/ComfyUI/training/<name>/images` | Training images and their `.txt` captions |
| `MyDrive/ComfyUI/training/<name>/output` | Training checkpoints and resumable state |

You can add files to these folders yourself with the Google Drive website or app.

## Troubleshooting

- **Notebook changes don't show up:** a running cell keeps its old code. Use **Runtime → Disconnect and delete
  runtime**, then open the notebook again from the links above (not an old Colab tab).
- **"This backend has no model downloads" / 404 on the website:** the website is connected to an old server. Restart
  the notebook as above and paste the new URL (it changes every run).
- **A cell is stuck on the spinner before starting:** another cell (or another tab on the same runtime) is still
  running. Stop it, or end old runtimes under **Runtime → Manage sessions**.
- **"Your session crashed after using all available RAM":** run one GPU notebook at a time, and open the notebooks
  fresh from this repo — in the current versions an out-of-memory error only restarts the server program, not the
  session. The website then says *"The generation server ran out of memory…"*; use a smaller size or fewer pictures.
- **A LoRA does nothing or errors:** it must match the model (SDXL LoRAs for BigLust, Qwen LoRAs for Qwen). The
  notebooks report LoRAs that don't fit.
- **Gallery ← → keys or a website change don't show up:** the site updates when Vercel redeploys after a merge. Reload
  the page with **Ctrl+Shift+R** (Cmd+Shift+R on a Mac) to skip the old cached version.
- **"Sound is turned off" in cell 1 / *Add sound* greyed out:** MMAudio couldn't be installed or downloaded. Re-run
  cell 1 (downloads resume), then cells 2 and 3. Videos still work without sound.
- Free Colab sessions disconnect after a while and have daily GPU limits.

## Website (frontend)

React + Vite app in `src/`, deployed on Vercel at https://google-collabimage-one.vercel.app.

```bash
npm install
```

```bash
npm run dev
```

Generated images and saved prompts are stored in your browser (IndexedDB / localStorage).

## Please note

Only edit or train on images you have the rights to use. Don't make sexual or nude images of real people without
their consent, and only train a LoRA of a real person with that person's consent.
