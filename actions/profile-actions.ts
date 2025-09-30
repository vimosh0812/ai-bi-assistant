"use server"

import { createClient } from "@/lib/supabase/server";

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: "admin" | "user"
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export async function createProfile(
    userId: string,
    email: string,
    fullName?: string
): Promise<Profile> {
    console.log("[Profile Actions] Creating new profile for user:", userId)
    const supabase = await createClient()
    
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
        
        if (error) {
            console.warn("[Profile Actions] Error creating profile:", error.message)
            throw error
        }
        
        console.log("[Profile Actions] Created profile:", data ?? newProfile)
        return data ?? newProfile
    } catch (err) {
        console.error("[Profile Actions] Failed to create profile:", err)
        throw err
    }
}

export async function getProfile(userId: string): Promise<Profile | null> {
    console.log("[Profile Actions] Fetching profile for user:", userId)
    const supabase = await createClient()
    
    try {
        const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle()

        if (error) {
            console.warn("[Profile Actions] getProfile error:", error.message)
            throw error
        }
        
        if (data) {
            console.log("[Profile Actions] Profile found:", data)
            return data
        }
        
        console.log("[Profile Actions] Profile not found")
        return null
    } catch (err) {
        console.error("[Profile Actions] getProfile exception:", err)
        throw err
    }
}

export async function getOrCreateProfile(
    userId: string,
    email: string,
    fullName?: string
): Promise<Profile> {
    try {
        const existingProfile = await getProfile(userId)
        if (existingProfile) {
            return existingProfile
        }
        
        console.log("[Profile Actions] Profile not found, creating new one")
        return await createProfile(userId, email, fullName)
    } catch (err) {
        console.error("[Profile Actions] getOrCreateProfile exception:", err)
        throw err
    }
}

export async function signOut() {
    const supabase = await createClient()
    
    try {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
        return { success: true }
    } catch (err) {
        console.error("[Profile Actions] Sign out error:", err)
        throw err
    }
}
