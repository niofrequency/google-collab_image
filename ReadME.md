# Google Colab Image Generator

Simple Colab notebooks for generating images with BigLust (SDXL) and Wan2.1.

## Open in Colab

### BigLust (SDXL)
[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/BIGLUST.ipynb)

**Direct link:**  
https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/BIGLUST.ipynb

### Wan 2.1
[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/Wan2.1_T2I_jupyter.ipynb)

**Direct link:**  
https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/Wan2.1_T2I_jupyter.ipynb

### Qwen Image Edit Rapid AIO (GGUF)
[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/QWEN-AIO-NSFW-EDIT.ipynb)

**Direct link:**  
https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/QWEN-AIO-NSFW-EDIT.ipynb

Run cells 1, 2 and 4 (cell 3 is an optional in-notebook test). Paste the `READY:` URL into the
frontend's Backend URL field; it switches to the recommended settings (4 steps, CFG 1,
`sa_solver` / `beta`). Add a reference image to edit it, or leave it empty for text-to-image.

Up to 3 reference images: Picture 1 is the image being edited (it also sets the default
Width/Height); Pictures 2 and 3 are extra references. Refer to them in the prompt, e.g.
"put the person from Picture 1 in the outfit from Picture 2". Each extra picture makes every edit slower.

LoRAs: use **+ Download LoRA** in the website (Civitai or Hugging Face link) or pick one you already
downloaded. They must be **Qwen-Image / Qwen-Image-Edit** LoRAs; SDXL LoRAs don't work with this model.
Each LoRA makes generation somewhat slower on a T4.

### SDXL LoRA training
[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/niofrequency/google-collab_image/blob/main/SDXL-LORA-TRAINING.ipynb)

Trains an SDXL LoRA on a free T4 with kohya-ss sd-scripts. Run cells 1–2, then use the website's **LoRA Training** tab:
paste the `READY:` URL, name the LoRA, drop in 15–40 images, edit or auto-tag their captions, and start training (every
option has an ⓘ explaining it). Images live in `MyDrive/ComfyUI/training/<name>/images`; the finished LoRA is saved to
`MyDrive/ComfyUI/loras_sdxl` and appears in the Image Generator's LoRA list when you next start BigLust. Progress is saved
every 250 steps; after a disconnect, start cells 1–2 again and press Start training with the same name to continue.
Cell 3 trains without the website. Don't run it at the same time as the BigLust or Qwen notebook.

## Adding your own SDXL checkpoints and LoRAs (BigLust notebook)

With the BigLust notebook running and its URL in the website's Backend URL field:

- **+ Download Checkpoint** / **+ Download LoRA**: paste a link and click *Download & Add*. Works with
  - Civitai model pages (`https://civitai.com/models/12345/...`, uses the newest version, or the one in `?modelVersionId=`)
  - Civitai download links (`https://civitai.com/api/download/models/67890`)
  - Hugging Face file links (`.../blob/main/model.safetensors` or `.../resolve/main/...`)
- Big files download in the background on the Colab runtime with progress shown. A new checkpoint is selected
  and a new LoRA is enabled at strength 0.8 automatically.
- The **Checkpoint** dropdown and the **Use a downloaded LoRA** list show every file in the runtime's
  `models/checkpoints` and `models/loras` folders, so anything you add there yourself shows up too.
- Use SDXL-based checkpoints (SDXL, Pony, Illustrious, ...) with SDXL LoRAs. SD 1.5 also loads, but LoRAs must match the checkpoint's base model.
- Files live on the Colab runtime, so they need to be downloaded again after the runtime is reset.

## LoRAs are kept in Google Drive

Both notebooks connect your Google Drive in their first cell (Colab asks you to allow it) and save
LoRAs in `MyDrive/ComfyUI/loras_qwen` (Qwen) or `MyDrive/ComfyUI/loras_sdxl` (BigLust), so they're
still there after the runtime is deleted. Set `USE_GOOGLE_DRIVE = False` at the top of that cell to
keep them on the runtime only. You can also copy `.safetensors` LoRAs into those Drive folders yourself.

If a LoRA doesn't fit the model (e.g. an SDXL LoRA on Qwen), generation stops with an error saying
so; if it only partly fits, the image is made and the website shows a warning.

## How to use

1. Click one of the **Open in Colab** buttons above.
2. Click **Copy to Drive** (or just run it).
3. Go to **Runtime → Change runtime type → T4 GPU**.
4. Run the cells from top to bottom.

## Notes

- Free Colab sessions can disconnect after 1–2 hours.
- Models are downloaded on first run.
- Frontend (if deployed): [Vercel](https://google-collabimage-one.vercel.app)
