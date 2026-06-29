'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { href: '/', label: 'ダッシュボード' },
  { href: '/rounds', label: 'ラウンド' },
  { href: '/golf-courses', label: 'ゴルフ場' },
]

export default function HeaderNav() {
  const pathname = usePathname()

  return (
    <header className="flex items-stretch h-[50px] pl-6 bg-white border-b border-gray-200">
      <div className="flex items-center text-sm font-medium text-gray-900 pr-6 border-r border-gray-200 mr-2">
        Golf Stuff
      </div>
      <nav className="flex items-stretch">
        {NAV_LINKS.map(({ href, label }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center px-4 text-sm',
                isActive
                  ? 'text-blue-600 font-medium shadow-[inset_0_-2px_0_#3b82f6]'
                  : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
