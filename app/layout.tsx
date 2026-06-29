import type { Metadata } from 'next'
import './globals.css'
import HeaderNav from './_components/HeaderNav'

export const metadata: Metadata = {
  title: 'Golf Stuff',
  description: 'ゴルフスコア管理・分析',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900">
        <HeaderNav />
        {children}
      </body>
    </html>
  )
}
