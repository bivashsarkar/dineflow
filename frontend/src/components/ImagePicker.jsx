import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { upload } from '../lib/api'
import { useToast } from '../context/ToastContext'

/**
 * Uploads an image straight to the backend (Cloudinary in production,
 * local disk in development) and hands back the public URL.
 */
export default function ImagePicker({
  value,
  onChange,
  folder = 'food',
  label = 'Photo',
  hint = 'PNG or JPG, up to 8 MB',
  ratio = 'aspect-[16/10]',
  rounded = 'rounded-2xl',
}) {
  const { toast } = useToast()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const data = await upload(`/api/upload/owner?folder=${encodeURIComponent(folder)}`, fd)
      onChange(data.url)
      toast('Image uploaded')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <span className="field-label">{label}</span>
      <div
        className={`relative ${ratio} ${rounded} overflow-hidden border border-dashed ${
          value ? 'border-cream-300' : 'border-cream-400'
        } bg-cream-100`}
      >
        {value ? (
          <>
            <img src={value} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-ink-900/0 opacity-0 transition hover:bg-ink-900/45 hover:opacity-100">
              <button
                type="button"
                onClick={() => inputRef.current && inputRef.current.click()}
                className="btn btn-sm bg-white text-ink-800"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => onChange('')}
                className="btn btn-sm bg-red-500 text-white"
              >
                <Trash2 size={14} /> Remove
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current && inputRef.current.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink-500 transition hover:text-brand-600"
          >
            {busy ? (
              <Loader2 size={22} className="animate-spin text-brand-500" />
            ) : (
              <ImagePlus size={22} />
            )}
            <span className="text-[13px] font-semibold">
              {busy ? 'Uploading…' : 'Click to upload'}
            </span>
            <span className="text-[11px]">{hint}</span>
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  )
}
