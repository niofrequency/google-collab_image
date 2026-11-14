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

LoRAs: use **+ Download LoRA** in the website (Civitai or Hugging Face link) or pick one you already
downloaded. They must be **Qwen-Image / Qwen-Image-Edit** LoRAs; SDXL LoRAs don't work with this model.
Each LoRA makes generation somewhat slower on a T4.

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

## How to use

1. Click one of the **Open in Colab** buttons above.
2. Click **Copy to Drive** (or just run it).
3. Go to **Runtime → Change runtime type → T4 GPU**.
4. Run the cells from top to bottom.

## Notes

- Free Colab sessions can disconnect after 1–2 hours.
- Models are downloaded on first run.
- Frontend (if deployed): [Vercel](https://google-collabimage-one.vercel.app)
