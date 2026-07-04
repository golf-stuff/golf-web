'use client'

import { useState, useTransition } from 'react'
import { signInWithPassword } from './actions'
import { createSupabaseBrowserClient } from '@/src/lib/supabase/client'

export default function LoginForm() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await signInWithPassword(formData)
      } catch (e) {
        if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e
        setError(e instanceof Error ? e.message : 'ログインに失敗しました')
      }
    })
  }

  async function handleOAuth(provider: 'google' | 'twitter') {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="flex flex-col gap-4 max-w-sm mx-auto p-6">
      <h1 className="text-lg font-medium text-gray-900">ログイン</h1>

      <form action={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          name="email"
          placeholder="メールアドレス"
          required
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="password"
          name="password"
          placeholder="パスワード"
          required
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white disabled:opacity-40"
        >
          {isPending ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => handleOAuth('google')}
          className="px-4 py-2 text-sm rounded-lg border border-gray-300"
        >
          Googleでログイン
        </button>
        <button
          onClick={() => handleOAuth('twitter')}
          className="px-4 py-2 text-sm rounded-lg border border-gray-300"
        >
          Xでログイン
        </button>
      </div>
    </div>
  )
}
