import 'server-only'
import { cookies, headers } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const bearerToken = () => headers().get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null

/**
 * Session-bound client: RLS applies, used to identify the user and check ownership.
 * Browser requests authenticate with the Supabase session cookie; API clients (Postman, scripts)
 * can send `Authorization: Bearer <supabase access_token>` instead.
 */
export function supabaseServer() {
  const token = bearerToken()
  if (token) {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    // auth.getUser() with no argument would look for a stored session; bind it to the bearer token.
    const getUser = sb.auth.getUser.bind(sb.auth)
    sb.auth.getUser = (jwt?: string) => getUser(jwt ?? token)
    return sb
  }
  const store = cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options))
        } catch {
          // called from a Server Component — middleware refreshes the session instead
        }
      },
    },
  })
}

/** Service-role client for writes that RLS intentionally blocks from the browser. Only used after an ownership check. */
export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
