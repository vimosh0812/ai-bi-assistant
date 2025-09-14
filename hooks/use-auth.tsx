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
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchProfile = async (userId: string) => {
    try {
      console.log("Fetching profile for user:", userId)
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()
      console.log("Profile fetch response:", { data, error })
      if (error) {
        console.log("Profile fetch error:", error.message)
        if (error.code === "PGRST116" || error.message.includes('relation "public.profiles" does not exist')) {
          console.log("Profiles table doesn't exist, using default profile")
          setProfile({
            id: userId,
            email: user?.email || "",
            full_name: user?.user_metadata?.full_name || null,
            role: "user",
            avatar_url: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          return
        }
        throw error
      }
      console.log("Profile fetched successfully:", data)
      setProfile(data)
    } catch (error) {
      console.error("Error fetching profile:", error)
      setProfile(null)
    }
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id)
    }
  }

  const signOut = async () => {
    console.log("Signing out user")
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error("Sign out error:", error.message)
      return
    }
    console.log("User signed out, redirecting to login")
    window.location.href = "/auth/login"
    setUser(null)
    setProfile(null)

  }

  useEffect(() => {
    console.log("Initializing auth state")
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("Initial session:", session?.user?.email || "No user")
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event, session?.user?.email || "No user")
      setUser(session?.user ?? null)

      if (session?.user) {
        await fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user || !profile) return

    console.log("Setting up real-time profile subscription for user:", user.id)

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
          console.log("Profile updated in real-time:", payload)
          if (payload.eventType === "UPDATE" && payload.new) {
            setProfile(payload.new as Profile)
          }
        },
      )
      .subscribe((status) => {
        console.log("Profile subscription status:", status)
      })

    return () => {
      console.log("Cleaning up profile subscription")
      supabase.removeChannel(profileSubscription)
    }
  }, [user, profile])

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
