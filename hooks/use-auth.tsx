"use client"

import type React from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { createContext, useContext, useEffect, useState } from "react"
import { getOrCreateProfile, type Profile } from "@/actions/profile-actions"

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<Profile | null | undefined>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: React.ReactNode
  initialUser?: User | null
}

const supabaseInstance = createClient();

export function AuthProvider({ children, initialUser }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser ?? null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(!initialUser)

  // Fetch profile using server action
  const fetchProfile = async (
    userId: string,
    email?: string,
    fullName?: string
  ): Promise<Profile | null> => {
    console.log("[AuthProvider] Fetching profile for user:", userId)
    try {
      const profileData = await getOrCreateProfile(userId, email || "", fullName)
      setProfile(profileData)
      return profileData
    } catch (err) {
      console.error("[AuthProvider] fetchProfile exception:", err)
      setProfile(null)
      return null
    }
  }

  const refreshProfile = async () => {
    if (user) {
      console.log("[AuthProvider] Refreshing profile for user:", user.id)
      return await fetchProfile(user.id, user.email, user.user_metadata?.full_name)
    }
  }

  const signOut = async () => {
    console.log("[AuthProvider] Signing out")
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setUser(null)
      setProfile(null)
      window.location.href = "/auth/sign-in"
    } catch (err: any) {
      console.error("[AuthProvider] Sign out error:", err.message)
      setUser(null)
      setProfile(null)
      window.location.href = "/auth/sign-in"
    }
  }

  // Initialize auth on mount
  useEffect(() => {
    const initAuth = async () => {
      console.log("[AuthProvider] Initializing auth...")
      setLoading(true)
      const {
        data: { session },
        error,
      } = await supabaseInstance.auth.getSession()

      if (error) {
        console.error("[AuthProvider] getSession error:", error)
        setUser(null)
        setProfile(null)
        setLoading(false)
        return
      }

      console.log("[AuthProvider] Session fetched:", session)

      if (session?.user) {
        console.log("[AuthProvider] Session user found:", session.user)
        setUser(session.user)
        await fetchProfile(session.user.id, session.user.email, session.user.user_metadata?.full_name)
      } else {
        console.log("[AuthProvider] No session user found")
        setUser(null)
        setProfile(null)
      }

      setLoading(false)
    }

    initAuth()

    // Listen for auth state changes (cross-tab)
    const {
      data: { subscription },
    } = supabaseInstance.auth.onAuthStateChange(async (_event, session) => {
      console.log("[AuthProvider] Auth state changed:", _event, session)
      if (session?.user) {
        setUser(session.user)
        await fetchProfile(session.user.id, session.user.email, session.user.user_metadata?.full_name)
      } else {
        setUser(null)
        setProfile(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
