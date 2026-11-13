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

## How to use

1. Click one of the **Open in Colab** buttons above.
2. Click **Copy to Drive** (or just run it).
3. Go to **Runtime → Change runtime type → T4 GPU**.
4. Run the cells from top to bottom.

## Notes

- Free Colab sessions can disconnect after 1–2 hours.
- Models are downloaded on first run.
- Frontend (if deployed): [Vercel](https://google-collabimage-one.vercel.app)
