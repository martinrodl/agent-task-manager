import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AgentTask',
  description: 'Task management for agentic workflows',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full" suppressHydrationWarning>{children}</body>
    </html>
  )
}
