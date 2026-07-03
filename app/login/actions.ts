'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/src/lib/supabase/server'

export async function signInWithPassword(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    throw new Error('メールアドレスとパスワードを入力してください')
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    throw new Error('ログインに失敗しました。メールアドレスまたはパスワードが正しくありません')
  }

  redirect('/')
}

export async function signOut() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
