"use client"

import type React from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { createContext, useContext, useEffect, useState } from "react"

interface Profile {
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

  // Create a profile if missing
  const createProfileIfNotExists = async (userId: string, email: string, fullName?: string): Promise<Profile> => {
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
      const { data, error } = await supabase.from("profiles").insert([newProfile]).select().maybeSingle()
      if (error) console.warn("Error creating profile:", error.message)
      return data ?? newProfile
    } catch (err) {
      console.warn("Failed to create profile locally:", err)
      return newProfile
    }
  }

  // Fetch profile from DB or create if missing
  const fetchProfile = async (userId: string, email?: string, fullName?: string): Promise<Profile | null> => {
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle()

      if (data) {
        setProfile(data)
        return data
      }

      // If missing, create
      const newProfile = await createProfileIfNotExists(userId, email || "", fullName)
      setProfile(newProfile)
      return newProfile
    } catch (err) {
      console.error("fetchProfile error:", err)
      setProfile(null)
      return null
    }
  }

  const refreshProfile = async () => {
    if (user) {
      return await fetchProfile(user.id, user.email, user.user_metadata?.full_name)
    }
  }

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setUser(null)
      setProfile(null)
      window.location.href = "/auth/sign-in"
    } catch (err: any) {
      console.error("Sign out error:", err.message)
      setUser(null)
      setProfile(null)
      window.location.href = "/auth/sign-in"
    }
  }

  useEffect(() => {
    if (user) fetchProfile(user.id, user.email, user.user_metadata?.full_name)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) await fetchProfile(session.user.id, session.user.email, session.user.user_metadata?.full_name)
      else setProfile(null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Real-time profile updates
  useEffect(() => {
    if (!user?.id) return
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
          if (payload.eventType === "UPDATE" && payload.new) setProfile(payload.new as Profile)
        },
      )
      .subscribe()

    return () => {
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
