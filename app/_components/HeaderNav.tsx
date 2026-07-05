'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/app/login/actions'

const NAV_LINKS = [
  { href: '/', label: 'ダッシュボード', adminOnly: false },
  { href: '/rounds', label: 'ラウンド', adminOnly: false },
  { href: '/golf-courses', label: 'ゴルフ場', adminOnly: true },
]

type Props = {
  role: 'user' | 'admin' | null
}

export default function HeaderNav({ role }: Props) {
  const pathname = usePathname()
  const navLinks = NAV_LINKS.filter(link => !link.adminOnly || role === 'admin')

  return (
    <header className="flex items-stretch h-[50px] pl-6 bg-white border-b border-gray-200">
      <div className="flex items-center text-sm font-medium text-gray-900 pr-6 border-r border-gray-200 mr-2">
        Golf Stuff
      </div>
      <nav className="flex items-stretch">
        {navLinks.map(({ href, label }) => {
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
      <div className="flex items-center ml-auto pr-6">
        <form action={signOut}>
          <button type="submit" className="text-xs text-gray-400 hover:text-gray-600">
            ログアウト
          </button>
        </form>
      </div>
    </header>
  )
}
