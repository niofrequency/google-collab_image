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
| **Qwen Image Edit 2511** — official model (Image Generator) | ✅ **Q2_K** (7.7 GB) + 4-step Lightning | ✅ **Q4_K_M** (12.8 GB) + 4-step Lightning | ✅ **Q8_0** (22.4 GB) + 4-step Lightning |
| **Head Swap** — Qwen-Image 2.1 + BFS Head LoRA (Head Swap) | ❌ too small | ✅ full model, one part on the GPU at a time (~1–2 min per swap) | ✅ faster |
| **Face Swap** — Qwen-Image-Edit 2509 + BFS Face LoRA (Face Swap) | ✅ **Q2_K** (6.8 GB) + 8-step Lightning | ✅ **Q4_K_M** (12.8 GB) + 8-step Lightning | ✅ **Q8_0** (22.4 GB) + 8-step Lightning |
| **Upscale** — 4x-UltraSharp / Real-ESRGAN + GFPGAN (Upscale) | ✅ pictures and videos (videos ~1 s per frame) | ✅ faster | ✅ fastest |
| **Image to Video — Wan 2.2 A14B** (Image to Video) | ❌ too big — use the 5B notebook | ✅ **A14B Q4_K_M**, 480p default | ✅ **A14B Q8_0**, 720p default |
| **Image to Video — Wan 2.2 5B** (Image to Video) | ✅ **TI2V 5B Q8_0** + Turbo LoRA (slow-ish; start with 480p, 2–3 s) | ✅ same model, faster | ✅ same model, faster |
| **Music — ACE-Step 1.5** (Music) | ✅ **turbo** + 1.7B planner (runs in fp32: slower), up to 3 min | ✅ **XL turbo** + 1.7B planner, up to 4 min | ✅ **XL turbo** + **4B** planner, up to 4 min |
| **SDXL LoRA training** (LoRA Training) | ✅ *standard* mode (fp16, image model only) | ✅ *improved* mode (bf16 + text encoder trained), 2–3× faster | ✅ *improved* mode, fastest |
| **Qwen 2511 LoRA training** (LoRA Training) | ❌ too small | ✅ **Character** and **Edit effect** LoRAs at 768 px (slow: much of the model kept in RAM) | ✅ **Character** and **Edit effect** LoRAs at 1024 px, several times faster |

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

The older notebooks at the bottom of the notebook list (Into Realism, Krea 2, Wan 2.1) haven't been updated with GPU
detection; they were made for the T4.

## Notebooks

| Notebook | What it does | Open in Colab |
|---|---|---|
| **BigLust** (SDXL) | Text-to-image with BigLust or any SDXL checkpoint, with LoRAs. Download checkpoints/LoRAs from the website. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/BIGLUST.ipynb) |
| **Qwen Image Edit Rapid AIO** (GGUF) | Edits photos from a text instruction, up to 3 reference images, with Qwen LoRAs. Also text-to-image. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/QWEN-AIO-NSFW-EDIT.ipynb) |
| **Image to Video — Wan 2.2 A14B** (best) | Animates a still image into a short video (up to ~7.5 s). Needs an **L4 or A100**. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/IMG2VID-WAN22-A14B.ipynb) |
| **Image to Video — Wan 2.2 5B** (free T4) | Same, with a smaller model that fits the **free T4** (up to 5 s, lower quality). | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/IMG2VID-WAN22-5B-FREE.ipynb) |
| **Music — ACE-Step 1.5** | Songs with vocals and lyrics, or instrumentals, from a style description. Free T4 or better. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/MUSIC-ACESTEP.ipynb) |
| **SDXL LoRA training** | Trains your own SDXL LoRA from 15–40 images, controlled from the website's LoRA Training tab. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/SDXL-LORA-TRAINING.ipynb) |
| **Qwen 2511 LoRA training** | Trains LoRAs for Qwen Image Edit 2511: a **character** or an **edit effect** from Before → After pairs. A100 (or L4, slower). Same LoRA Training tab. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/QWEN-2511-LORA-TRAINING.ipynb) |
| **Head Swap** | Puts the whole head (face, hair, head shape) from one photo onto the person in another, keeping pose, body, light and background. Qwen-Image 2.1 + BFS Head Swap LoRA. **L4 or A100**. Website: Head Swap tab. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/HEADSWAP.ipynb) |
| **Face Swap** | Puts only the face from one photo onto the person in another; their hair and head shape stay. Qwen-Image-Edit 2509 (GGUF size picked for your GPU) + BFS Face Swap LoRA + 8-step Lightning. Website: Face Swap tab. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/FACESWAP.ipynb) |
| **Upscale** | Makes pictures 2–4× bigger (4x-UltraSharp or Real-ESRGAN, optional GFPGAN face restore) and videos 720p / 1080p / 1440p with the sound kept and optional 2× frame rate. **Send to Upscale** in any tab's full-size viewer. Website: Upscale tab. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/UPSCALE.ipynb) |
| Into Realism (SDXL) | Older SDXL text-to-image notebook with a website server. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/INTO-REALISM.ipynb) |
| Krea 2 Realism | Older Krea 2 text-to-image notebook with a website server. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/KREA2.ipynb) |
| **Qwen Image Edit 2511** (GGUF) | The official Qwen-Image-Edit-2511 model (GGUF size picked for your GPU) with the 4-step Lightning LoRA — same website features as Rapid AIO (reference pictures, LoRAs, model sizes). Rapid AIO is a community merge tuned for speed and NSFW; 2511 is the plain official model. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/QWEN-2511-IMAGE-EDIT.ipynb) |
| Wan 2.1 (GGUF) | Text-to-image with Wan 2.1 14B inside the notebook (no website server). | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/Wan2.1_T2I_jupyter.ipynb) |

Direct links:
- BigLust: https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/BIGLUST.ipynb
- Qwen Image Edit Rapid AIO: https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/QWEN-AIO-NSFW-EDIT.ipynb
- Image to Video (A14B, L4/A100): https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/IMG2VID-WAN22-A14B.ipynb
- Image to Video (5B, free T4): https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/IMG2VID-WAN22-5B-FREE.ipynb
- Music (ACE-Step 1.5): https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/MUSIC-ACESTEP.ipynb
- SDXL LoRA training: https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/SDXL-LORA-TRAINING.ipynb
- Qwen 2511 LoRA training: https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/QWEN-2511-LORA-TRAINING.ipynb
- Head Swap: https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/HEADSWAP.ipynb
- Face Swap: https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/FACESWAP.ipynb
- Upscale: https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/UPSCALE.ipynb
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

## Face reference: which models it works with

**Face reference** keeps one character's face the same across many pictures, from 1–3 pictures of that face, with no
training. Under the hood it's **IP-Adapter FaceID Plus v2 (SDXL)**:

1. **InsightFace** (a face recogniser, on the CPU) finds the face in each reference picture and turns it into an
   *identity* — a list of numbers describing who it is (face shape, eyes, nose, mouth), not the lighting or pose.
2. A **CLIP image encoder** looks at the aligned face crop for finer detail (skin, eyebrows, expression style).
3. The **adapter** feeds both into SDXL's attention layers while every picture is drawn, plus a small companion
   **LoRA** (strength 0.6) that helps SDXL follow it. With several pictures the identities are averaged — different
   angles give a steadier likeness.
4. It's applied after your own LoRAs, to the main image and to **face fix** (which redraws the face at full size —
   most important for small faces in full-body shots). A same-model **refiner** pass keeps it too.

Your prompt still decides everything else: pose, clothes, hair, place, style. *Strength* 0.6 light · 0.8 default ·
1.0–1.2 strong (closer likeness, less freedom in expression).

| Model / notebook | Face reference | How to keep a face instead |
|---|---|---|
| **BigLust** (BIGLUST notebook) | ✅ Yes — built in (toggle under Face fix, saved characters, *Character* presets) | — |
| **Any SDXL checkpoint** you download in BigLust: Juggernaut XL, RealVisXL, Pony, Illustrious, … | ✅ Yes — best likeness on photo-style models; anime/cartoon models work but are less exact | — |
| **SD 1.5** checkpoints | ❌ No (the adapter is made for SDXL) — the site says so | Use an SDXL checkpoint |
| **Qwen Image Edit Rapid AIO** / **Qwen 2511** | ❌ No adapter — it isn't needed | Qwen reads pictures itself: put the face picture in as a **reference picture** (Picture 1–3) and say what to keep, e.g. *"the woman from Picture 2, keep her face exactly the same, standing on a beach at sunset"*. Use the *Keep face* preset when editing a photo of that person |
| **Image to Video** (Wan 2.2 A14B / 5B) | ❌ Not inside the video model | The face comes from the **start image** (and the **end image** on A14B): make them with a saved character — *Make start image* in the Video tab, or *Video start* / *Video end* in the Image Generator viewer — and use *Continue from last frame* for longer scenes |
| **Into Realism** (older SDXL notebook) | ❌ Not in that notebook | Use the BIGLUST notebook (same model, newer server) |
| **Krea 2**, **Wan 2.1** (older notebooks) | ❌ No | — |
| **LoRA training** | — | For the strongest likeness from every angle, train a LoRA of the character and use it *together with* Face reference |

### Pose / structure / style picture (BigLust)

Next to the Face reference you can add a **second picture** — the face still comes from the Face reference (or your
LoRA / prompt), and this picture decides:

| Mode | What it copies | How |
|---|---|---|
| **Body pose** | body, arms, hands and head angle | OpenPose skeleton (body + hands + face) → `xinsir/controlnet-openpose-sdxl-1.0` |
| **Depth / framing** | shapes, layout and camera framing (stricter than the pose) | Depth Anything V2 Small depth map → `xinsir/controlnet-depth-sdxl-1.0` |
| **Style / outfit** | outfit, colours, light and style, without fixing positions | IP-Adapter Plus SDXL (`ip-adapter-plus_sdxl_vit-h`, same image encoder as Face reference) |
| **Img2img** | the picture itself, redrawn | starts from the picture instead of noise; *Denoise* 0.3 close … 0.8 loose |

*Strength* (0.8) is how strongly it steers; *Until* (0.85) stops steering near the end so the last steps can refine
details. **Face fix never gets the pose / depth ControlNet**, so a full-body skeleton can't distort the close-up of the
face; it keeps the Face reference and your LoRAs. The pose and depth readers run on the CPU (no GPU memory). The
ControlNets (2.5 GB each) and IP-Adapter Plus (0.85 GB) download the first time their mode is used in a session, and
only one is kept loaded at a time. Use **Use as pose / style** in the full-size viewer to take a picture from the gallery.

### Inpaint / outpaint (BigLust, Qwen 2511, Qwen Rapid AIO)

Redraw **part** of a picture, or **extend** it to another shape, without making the whole shot again. In the Image
Generator, press **Inpaint / outpaint** in the gallery's full-size viewer (or *Open a picture to inpaint / outpaint*):

- **Paint** over what should change (hands, a face, clothes, an object); *Erase*, *Undo / Redo*, *Invert*, *Clear*.
- **Extend to** 16:9, 9:16, 1:1, 4:3, 3:4, or type Top / Bottom / Left / Right in pixels — e.g. a 3:4 portrait to 16:9
  for a video start frame. The new borders (and a narrow seam just inside the old edge) are filled in.
- Describe the result in the prompt and press **Generate**.

Only the red areas change: the notebook pastes everything else back from your picture, **pixel for pixel**. BigLust
redraws only under the mask (SDXL noise mask) with your checkpoint, LoRAs, Face reference and pose / style picture;
*Denoise* 1.0 redraws the area completely, 0.5–0.8 keeps some of what was there. Face fix runs before the paste-back,
so faces outside the mask can't change either; the refiner is skipped. With Qwen, the picture becomes Picture 1 and your
reference pictures Pictures 2–3. *Grow* widens the mask a few pixels; *Feather* softens the edge of the pasted area.

**Workflow for comics and short films**

1. In the Image Generator (BigLust), make a face you like — or upload clear face pictures — and press **Use as face** in
   the full-size viewer (up to 3 pictures).
2. **+ Save as character**, give it a name. Characters stay in the browser and, with ☁ cloud backup, on every device.
3. For each panel: pick the character and the **Character (face reference)** preset, describe the scene.
4. For video shots: **Make start image** (and *end image*) from the character in the Image to Video tab, describe the
   motion, generate, then **Continue from last frame** for the next part.

Only use pictures of real people who have agreed to it — especially for anything explicit, which without consent is
illegal in many places. Faces you generated yourself are the safe choice for characters.

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

### Modes, and fixing deformed bodies

| Mode | What it does | Time |
|---|---|---|
| **Fast** | 4 steps with the Lightning speed-up on both passes | quickest — but the motion pass gets only 2 steps, so bodies often come out **deformed** and motion looks slow |
| **Balanced** (A14B default) | the motion starts with the **full model** (2 steps at real CFG), then Lightning finishes it (2 + 4 steps) | ~2–3× Fast — bodies, arms and legs hold together much better |
| **Quality** | the plain model, 20 steps | ~5× Fast |

Presets **Better bodies** (Balanced, 480p) and **Better bodies HD** (Balanced, 720p — best short of Quality, use an
L4/A100). Also: keep the person **large** in the start image, ask for **one simple action** ("she turns and smiles"),
and avoid fast or complex moves (spinning, dancing, crossing arms) in short clips. On the free 5B notebook, Balanced
is 8 Turbo steps instead of 4.

### LoRAs for video

Same as in the Image Generator: **+ Download LoRA** in the Image to Video tab, paste a Civitai or Hugging Face link,
then pick it from the list and set the strength (1.0 is usual for video LoRAs; lower if the motion looks overdone).
They're kept in Google Drive (`MyDrive/ComfyUI/loras_wan22_a14b` or `loras_wan22_5b`; cell 1 asks to connect Drive —
set `USE_GOOGLE_DRIVE = False` to skip).

- **A14B notebook:** Wan 2.2 A14B **I2V** LoRAs and most Wan 2.1 14B I2V LoRAs. Wan 2.2 runs two models — high-noise
  (motion/layout) then low-noise (details) — and Wan 2.2 LoRAs often come as a **pair** (`…_high_noise` /
  `…_low_noise`): add both, and *Auto* puts each on its model from the file name. Other LoRAs go on *Both models*.
- **Free 5B notebook:** only Wan 2.2 **5B** LoRAs.
- Image LoRAs (SDXL, Qwen…) don't work on video; a LoRA that doesn't fit the model is refused with a message, and
  one that only partly fits shows a warning.

### Keeping a character consistent (short films)

- **Start from your character:** make each shot's first frame in the Image Generator with a saved **character**
  (Face reference), then in the full-size viewer press **Video start** — it opens here with the picture loaded.
- **Or make it right here:** open **Make the start / end image from a character**, pick a saved character, describe
  the picture ("Mia standing at the front door, rainy night, medium shot") and press **Make start image** (or *Make
  end image*, with *Same shape as the start image*). It uses the BigLust server connected in the Image Generator tab
  (its checkpoint and LoRAs, Face reference + face fix), so the **BigLust notebook must be running too** — a second
  Colab runtime, which uses compute units twice as fast while both run. The pictures are also saved in the Image
  Generator's gallery.
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

### Keeping datasets in the cloud (retrain later with more images)

Your images and tags already live in Google Drive (`MyDrive/ComfyUI/training/<name>`). With ☁ **cloud backup**
signed in, the LoRA Training tab also has **Save "name" to cloud** (full-size images, tags, trigger word, training and
auto-tag settings) and **Restore from cloud** (puts a saved dataset back on the training server — e.g. a new Drive or
after deleting it). To retrain with more images: restore (if needed), add the new images, tag them, then **Start
training** to continue, or **Start fresh** to retrain from zero. Saving again later only uploads new images. See
[Cloud backup](#cloud-backup-firebase).

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

## Qwen Image Edit 2511 LoRA training

[Open in Colab](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/QWEN-2511-LORA-TRAINING.ipynb) ·
Trains LoRAs for **Qwen-Image-Edit-2511** with [musubi-tuner](https://github.com/kohya-ss/musubi-tuner) (kohya's trainer
for newer models). It uses the same **LoRA Training** tab: pick **Qwen Image Edit 2511** in the **Trainer** switch at the top (or just paste this notebook's URL — the tab switches by itself). Each trainer remembers its own server link and settings.
Finished LoRAs go to `MyDrive/ComfyUI/loras_qwen`, so they appear in the LoRA list of **both** Qwen edit notebooks.

| LoRA type | What you give it | GPU | Use it like this |
|---|---|---|---|
| **Character** | 15–30 pictures of one character + a trigger word | **A100** (1024 px) or **L4** (768 px, slower) | Picture 1 = a picture of the character, prompt with the trigger word: *"zxq_mia standing on a rooftop at night, wind in her hair"* |
| **Edit effect** | 10–30 **pairs**: a *Before* picture, the *After* picture, and an instruction | **A100** (1024 px) or **L4** (768 px, slow) | Picture 1 = any picture, prompt with the same instruction: *"turn this photo into a comic-book drawing"* |

**Steps**
1. **Runtime → Change runtime type → A100** (or **L4** when no A100 is available — both LoRA types work, at 768 px and much slower). Run **cell 1** — it downloads the full
   training model (~58 GB, about 10–15 minutes) — then **cell 2**, and paste its `READY:` URL into the LoRA Training tab.
2. Type a LoRA name and pick the **LoRA type**.
3. **Character:** set a trigger word and class word, drop in the pictures, press **Auto-caption all** (Qwen2.5-VL writes a
   sentence per picture — pose, clothes, place — but not the face, so the trigger word learns the face), check the captions.
   **Edit effect:** drop in the *After* pictures, click **+ Before picture** on each card to add its starting picture,
   and write the instruction under each (or use *Instruction for all pictures*).
4. Pick a preset — **Default** (character, 1,200 steps), **Character – strong likeness** (dim 32, 1,800 steps),
   **Edit effect** (dim 32, 1,500 steps) or **Quick test** — and press **Start training**.

**How long:** roughly 1–2 hours on an A100 for the Default preset; an L4 takes noticeably longer (much of the model is
swapped to RAM each step) — especially edit-effect training, where each step also processes the Before picture. On an
L4, run **Quick test** first to see the speed, and consider 1,000 steps for the full run. Progress is saved every 200 steps: if Colab disconnects, run cells 1–2 again and press
Start training with the same name to continue. *Start fresh* retrains from zero (the old run is kept as `_vN`).

**How it trains:** the model is loaded in fp8 (musubi converts the bf16 file), pictures and captions are cached first,
then the LoRA trains at batch 1 with 8-bit AdamW. *Character* LoRAs pair every picture with a **different** picture of
the same character as Picture 1, and each caption becomes *"&lt;trigger&gt; &lt;class&gt; from Picture 1, &lt;description&gt;"* — so the
LoRA learns the character, the trigger word, and to carry the character over from a reference picture. *Edit effect*
LoRAs learn your Before → After change with your instruction.

**Tips**
- Character: varied pictures (angles, outfits, places, lighting), the face clearly visible; 15–30 is plenty. For your
  own made-up characters, make the pictures with BigLust + Face reference first, then train on them.
- Edit effect: consistent pairs (same framing and subject in Before and After), the **same instruction** every time.
- Using the LoRA: strength 0.8–1.0 in the Qwen notebook (with its 4-step speed-up: 4 steps, CFG 1).
- Datasets live in `MyDrive/ComfyUI/training_qwen/<name>/` (`images` + captions, `control` = Before pictures), and
  ☁ *Save to cloud* backs them up too (Before pictures included).
- Only train on pictures you have the rights to use, and only make a LoRA of a real person with that person's consent.

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
| `MyDrive/ComfyUI/loras_qwen` | Qwen-Image-Edit LoRAs (downloaded, or trained with the Qwen 2511 trainer) |
| `MyDrive/ComfyUI/loras_wan22_a14b` / `loras_wan22_5b` | Image to Video LoRAs |
| `MyDrive/ComfyUI/training/<name>/images` | SDXL training images and their `.txt` captions |
| `MyDrive/ComfyUI/training/<name>/output` | SDXL training checkpoints and resumable state |
| `MyDrive/ComfyUI/training_qwen/<name>/images` · `control` · `output` | Qwen 2511 training pictures + captions, Before pictures, checkpoints |

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

Generated images and saved prompts are stored in your browser (IndexedDB / localStorage). With **cloud backup**
(below) they are also copied to your own Firebase project.

## Cloud backup (Firebase)

Sign in with Google (**☁** at the top right of the site) and everything is backed up to your own Firebase project
and synced between your devices:

| What | How |
|---|---|
| Image, video and music galleries | automatically after each new item; deleting deletes the cloud copy too |
| Saved characters, saved prompts, your presets | automatically (every ~20 s); merged by name when you sign in on another device |
| LoRA training datasets (full-size images, tags, trigger word, settings) | **Save "name" to cloud** / **Restore from cloud** in the LoRA Training tab |

Everything also stays in the browser, so the site works the same when you're signed out. Trained LoRA files stay in
Google Drive (`MyDrive/ComfyUI/loras_sdxl`).

### One-time setup (about 10 minutes)

1. **Create a project** at [console.firebase.google.com](https://console.firebase.google.com) → *Add project*.
2. **Sign-in:** *Build → Authentication → Get started → Google → Enable*. Then *Settings → Authorized domains → Add
   domain* → `google-collabimage-one.vercel.app`.
3. **Database:** *Build → Firestore Database → Create database* (production mode, any location). Open the **Rules**
   tab, paste the contents of [`firestore.rules`](firestore.rules) and **Publish**.
   **Already using this Firebase project for another app?** Don't replace your rules — add the `match` blocks from
   these files inside your existing ones. Avoid a broad `match /users/{uid}/{document=**}` rule: Firestore allows
   access if *any* rule allows it, so it would also open your other collections (e.g. a wallet) to writes.
4. **File storage:** *Build → Storage → Get started*. Cloud Storage needs the pay-as-you-go **Blaze** plan (it still
   includes a free amount each month; set a budget alert under *Usage and billing* so there are no surprises — videos
   and training images add up). Open the **Rules** tab, paste [`storage.rules`](storage.rules) and **Publish**.
5. **Allow the site to download files (CORS):** in the Google Cloud console for the same project, open **Cloud Shell**
   (the `>_` icon), upload [`cors.json`](cors.json) (⋮ → Upload) and run, with your bucket name from the Storage page:

   ```bash
   gcloud storage buckets update gs://YOUR-BUCKET --cors-file=cors.json
   ```

   `cors.json` lets the browser download from any site address (`"*"`), so it keeps working on Vercel preview links
   and custom domains. That doesn't make your files public: the Storage rules still allow each signed-in account only
   its own folder. Check that it worked with
   `gcloud storage buckets describe gs://YOUR-BUCKET --format="default(cors_config)"`.
   This **replaces** the bucket's CORS settings; if another app's settings were there, they are covered by `"*"`.

6. **Connect the website:** *Project settings (⚙) → General → Your apps → Web (`</>`)* → register an app → copy the
   `firebaseConfig = { ... }` block. Either paste it in the **☁** panel on the site (saved in that browser), or add it
   once for every browser as Vercel environment variables (*Vercel → Project → Settings → Environment Variables*,
   then redeploy): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
   `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` (template: [`.env.example`](.env.example)).
7. Press **☁ → Sign in with Google**. The first sync uploads everything already in the browser.

The rules let each Google account read and write only its own folder (`users/<uid>/…`), so nobody else can see your
files, even though the Firebase config itself is not secret. Keep it to content you have the right to store: generated
pictures of real people only with their consent.

**Problems:** *Permission denied* → the rules from steps 3–4 aren't published. *Downloads fail on a second device*, or
*"Max retry time for operation exceeded (storage/retry-limit-exceeded)"* → step 5 (CORS) wasn't run, or was run with an
older `cors.json` that doesn't include the address you open the site from; also check that `storageBucket` in the
config is exactly the bucket name on the Firebase Storage page (newer projects use `PROJECT.firebasestorage.app`, older
ones `PROJECT.appspot.com`). *Sign-in popup error "unauthorized domain"* → step 2 (add every address you open the site from).

## Please note

Only edit or train on images you have the rights to use. Don't make sexual or nude images of real people without
their consent, and only train a LoRA of a real person with that person's consent.
