# Google Colab Image Generator

Free Google Colab notebooks for generating, editing and training images with ComfyUI, plus a website
(**ARX Image Generator**) that controls them.

- **Website:** https://google-collabimage-one.vercel.app
- **Repository:** https://github.com/niofrequency/google-collab_image

Each notebook runs on a free **T4 GPU** in Colab and prints a `READY:` URL. Paste that URL into the website to use it.

## Notebooks

| Notebook | What it does | Open in Colab |
|---|---|---|
| **BigLust** (SDXL) | Text-to-image with BigLust or any SDXL checkpoint, with LoRAs. Download checkpoints/LoRAs from the website. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/BIGLUST.ipynb) |
| **Qwen Image Edit Rapid AIO** (GGUF) | Edits photos from a text instruction, up to 3 reference images, with Qwen LoRAs. Also text-to-image. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/QWEN-AIO-NSFW-EDIT.ipynb) |
| **SDXL LoRA training** | Trains your own SDXL LoRA from 15–40 images, controlled from the website's LoRA Training tab. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/SDXL-LORA-TRAINING.ipynb) |
| Into Realism (SDXL) | Older SDXL text-to-image notebook with a website server. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/INTO-REALISM.ipynb) |
| Krea 2 Realism | Older Krea 2 text-to-image notebook with a website server. | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/KREA2.ipynb) |
| Qwen Image Edit 2511 (fp8) | Older notebook with the official Qwen-Image-Edit-2511 fp8 model (~20 GB, likely too big for a free T4; uses ngrok). | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/QWEN-2511-IMAGE-EDIT.ipynb) |
| Wan 2.1 (GGUF) | Text-to-image with Wan 2.1 14B inside the notebook (no website server). | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/Wan2.1_T2I_jupyter.ipynb) |

Direct links:
- BigLust: https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/BIGLUST.ipynb
- Qwen Image Edit Rapid AIO: https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/QWEN-AIO-NSFW-EDIT.ipynb
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
- **Presets:** one click sets size, steps, CFG, sampler, face fix and LoRA strength — *Default*, *Portrait (best
  likeness)*, *Upper body*, *Full body*, *Landscape*, *Fast draft*. Save your own with *+ Save current as preset*
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
- **LoRAs:** *+ Download LoRA* on the website. Only **Qwen-Image / Qwen-Image-Edit** LoRAs work; they're kept in
  `MyDrive/ComfyUI/loras_qwen`. Each LoRA adds some time per image.
- Re-running cell 3 restarts the server with the current code (same URL). To stop it: **Runtime → Restart session**.

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
