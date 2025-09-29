"use client"

import type React from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { createContext, useContext, useEffect, useState } from "react"

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: "admin" | "user"
  avatar_url: string | null
  created_at: string
  updated_at: string
}

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

export function AuthProvider({ children, initialUser }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser ?? null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(!initialUser)
  const supabase = createClient()

  // Create profile if missing
  const createProfileIfNotExists = async (
    userId: string,
    email: string,
    fullName?: string
  ): Promise<Profile> => {
    console.log("[AuthProvider] Creating new profile for user:", userId)
    const newProfile: Profile = {
      id: userId,
      email,
      full_name: fullName || null,
      role: "user",
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .insert([newProfile])
        .select()
        .maybeSingle()
      if (error) console.warn("[AuthProvider] Error creating profile:", error.message)
      console.log("[AuthProvider] Created profile:", data ?? newProfile)
      return data ?? newProfile
    } catch (err) {
      console.warn("[AuthProvider] Failed to create profile locally:", err)
      return newProfile
    }
  }

  // Fetch profile from DB or create if missing
  const fetchProfile = async (
    userId: string,
    email?: string,
    fullName?: string
  ): Promise<Profile | null> => {
    console.log("[AuthProvider] Fetching profile for user:", userId)
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle()

      if (error) console.warn("[AuthProvider] fetchProfile error:", error.message)
      if (data) {
        console.log("[AuthProvider] Profile found:", data)
        setProfile(data)
        return data
      }

      console.log("[AuthProvider] Profile not found, creating new one")
      const newProfile = await createProfileIfNotExists(userId, email || "", fullName)
      setProfile(newProfile)
      return newProfile
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
      } = await supabase.auth.getSession()

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
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
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

  // Real-time profile updates
  useEffect(() => {
    if (!user?.id) return
    console.log("[AuthProvider] Subscribing to profile changes for user:", user.id)
    const profileSubscription = supabase
      .channel(`profile-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          console.log("[AuthProvider] Profile change event:", payload)
          if (payload.eventType === "UPDATE" && payload.new) setProfile(payload.new as Profile)
        }
      )
      .subscribe()

    return () => {
      console.log("[AuthProvider] Unsubscribing profile changes for user:", user.id)
      supabase.removeChannel(profileSubscription)
    }
  }, [user?.id])

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
