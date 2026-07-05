import { prisma } from '@/src/lib/db/prisma'
import { createSupabaseServerClient } from '@/src/lib/supabase/server'

export type CurrentUser = {
  id: string
  email: string | null
  role: 'user' | 'admin'
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const existing = await prisma.mstUser.findUnique({
    where: { id: user.id },
  })

  if (existing) {
    return { id: existing.id, email: existing.email, role: existing.role }
  }

  const created = await prisma.mstUser.create({
    data: { id: user.id, email: user.email ?? null },
  })

  return { id: created.id, email: created.email, role: created.role }
}
