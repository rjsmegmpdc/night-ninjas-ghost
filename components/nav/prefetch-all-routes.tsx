'use client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const ROUTES = [
  '/patrol', '/dojo', '/strike', '/recon', '/race',
  '/calendar', '/journal', '/shoes', '/coach-log',
  '/club', '/vo2max', '/profile', '/settings', '/help',
  '/test-lab',
]

export function PrefetchAllRoutes() {
  const router = useRouter()
  useEffect(() => {
    ROUTES.forEach(route => router.prefetch(route))
  }, [router])
  return null
}
