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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const createProfileIfNotExists = async (userId: string, email: string, fullName?: string): Promise<Profile> => {
    const newProfile: Profile = {
      id: userId,
      email: email,
      full_name: fullName || null,
      role: "user",
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    try {
      // Try to insert the profile into the database
      const { error: insertError } = await supabase
        .from("profiles")
        .insert([newProfile])
        .select()
        .single()

      if (insertError && insertError.code !== "23505") { // 23505 is duplicate key error
        console.warn("Failed to create profile in database:", insertError.message)
      }
    } catch (error) {
      console.warn("Database profile creation failed, using local profile:", error)
    }

    return newProfile
  }

  const fetchProfile = async (userId: string, userEmail?: string, userFullName?: string): Promise<Profile | null> => {
    try {
      // First attempt: Try to fetch existing profile
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single()

      if (data) {
        setProfile(data)
        return data
      }

      // If profile doesn't exist, handle different error cases
      if (error) {
        if (error.code === "PGRST116" || error.message.includes('relation "public.profiles" does not exist')) {
          // Table doesn't exist - create local profile
          const fallbackProfile = await createProfileIfNotExists(userId, userEmail || "", userFullName)
          setProfile(fallbackProfile)
          return fallbackProfile
        }

        if (error.code === "PGRST104") {
          // Profile not found - wait a bit then try to create new profile
          // Sometimes the database trigger needs a moment to create the profile
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // Try fetching once more in case the trigger created it
          const { data: retryData } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .single()
          
          if (retryData) {
            setProfile(retryData)
            return retryData
          }
          
          // Still not found, create new profile
          const newProfile = await createProfileIfNotExists(userId, userEmail || "", userFullName)
          setProfile(newProfile)
          return newProfile
        }
      }

      // For other errors, try to create profile anyway
      if (userEmail) {
        const newProfile = await createProfileIfNotExists(userId, userEmail, userFullName)
        setProfile(newProfile)
        return newProfile
      }

      throw new Error("Unable to fetch or create profile")
    } catch (error) {
      console.error("Error in fetchProfile:", error)
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
    } catch (error: any) {
      console.error("Sign out error:", error.message)
      // Still clear local state and redirect even if server sign out fails
      setUser(null)
      setProfile(null)
      window.location.href = "/auth/sign-in"
    }
  }

  useEffect(() => {
    let mounted = true

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!mounted) return

        setUser(session?.user ?? null)
        
        if (session?.user) {
          await fetchProfile(
            session.user.id, 
            session.user.email, 
            session.user.user_metadata?.full_name
          )
        }
      } catch (error) {
        console.error("Error initializing auth:", error)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initializeAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      setUser(session?.user ?? null)

      if (session?.user) {
        try {
          await fetchProfile(
            session.user.id, 
            session.user.email, 
            session.user.user_metadata?.full_name
          )
        } catch (error) {
          console.error("Error fetching profile on auth change:", error)
        }
      } else {
        setProfile(null)
      }
      
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

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
          if (payload.eventType === "UPDATE" && payload.new) {
            setProfile(payload.new as Profile)
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(profileSubscription)
    }
  }, [user?.id])

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
