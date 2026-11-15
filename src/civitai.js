// Civitai API key added to Civitai download links (some models need it). Used by the image and video tabs.
export const CIVITAI_TOKEN = "777a5632707c15ecf54e13eb3b1b862b"

export function withCivitaiToken(url) {
  url = (url || '').trim()
  if (url.includes('civitai.com') && !url.includes('token=')) url += (url.includes('?') ? '&' : '?') + 'token=' + CIVITAI_TOKEN
  return url
}
