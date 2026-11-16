import { SwapTab } from './HeadSwap.jsx'

// Face Swap: the Head Swap page with the face swap settings (FACESWAP.ipynb backend, its own gallery)
export default function FaceSwap({ active = true }) {
  return <SwapTab active={active} mode="faceswap" />
}
