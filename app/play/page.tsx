import { redirect } from 'next/navigation'

/** Legacy hub URL — lobby now lives at `/`. */
export default function PlayPage() {
  redirect('/')
}
