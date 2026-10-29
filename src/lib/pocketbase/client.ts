import PocketBase from 'pocketbase'
import { installLocalPocketBaseInterceptor } from './localBackend'

installLocalPocketBaseInterceptor()

const pb = new PocketBase(
  import.meta.env.VITE_POCKETBASE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'),
)
pb.autoCancellation(false)
pb.beforeSend = (url, options) => {
  if (typeof window !== 'undefined') {
    options.fetch = window.fetch
  }
  return { url, options }
}

export default pb
