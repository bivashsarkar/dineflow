import { Link } from 'react-router-dom'
import { ArrowLeft, SearchX } from 'lucide-react'
import { Logo } from '../components/ui'

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-cream-50 px-6 text-center">
      <div>
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <SearchX size={44} className="mx-auto text-brand-500" />
        <h1 className="mt-5 font-display text-3xl font-bold text-ink-800">Page not found</h1>
        <p className="mt-2 text-sm text-ink-500">
          The page you are looking for does not exist or has moved.
        </p>
        <Link to="/" className="btn-primary mt-7 inline-flex">
          <ArrowLeft size={16} /> Back to DineFlow
        </Link>
      </div>
    </div>
  )
}
