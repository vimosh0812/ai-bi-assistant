"use server"

import { createClient } from "@/lib/supabase/server";

export async function fetchFoldersAction(): Promise<any[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from("folders")
        .select("*")
        .order("created_at", { ascending: false })
    if (error) {
        console.error("Error fetching folders:", error)
        throw error
    }
    return data || []
}

export async function createFolderAction(data: { name: string; description: string }): Promise<any> {
    console.log("createFolder action called", data)

    const supabase = await createClient()
    
    try {
        console.log("Fetching current user...")
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser()

        console.log("User data:", user)
        if (userError) throw userError
        if (!user) throw new Error("Not authenticated")
        
        const userId = user.id
        console.log("Authenticated user:", userId)

        const { data: newFolder, error } = await supabase
            .from("folders")
            .insert([{ name: data.name, description: data.description, user_id: userId }])
            .select()
            .single()

        if (error) throw error
        console.log("Folder created:", newFolder)

        return newFolder
    } catch (error: any) {
        console.error("Error creating folder:", error.message || error)
        throw error
    }
}

export async function updateFolderAction(id: string, data: { name: string; description: string }): Promise<any> {
    const supabase = await createClient()
    
    const { data: updatedFolder, error } = await supabase
        .from("folders")
        .update({
            name: data.name,
            description: data.description,
            updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single()

    if (error) throw error
    return updatedFolder
}

export async function deleteFolderAction(id: string): Promise<void> {
    const supabase = await createClient()
    
    const { error } = await supabase.from("folders").delete().eq("id", id)
    if (error) throw error
}
