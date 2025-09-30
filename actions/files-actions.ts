"use server"

import { createClient } from "@/lib/supabase/server";

export async function fetchFilesAction(folderId: string): Promise<any[]> {
    if (!folderId) {
        console.warn("No folderId provided")
        return []
    }

    const supabase = await createClient()
    
    try {
        console.log("Fetching files for folder:", folderId)
        const { data, error } = await supabase
            .from("files")
            .select("*")
            .eq("folder_id", folderId)
            .order("created_at", { ascending: false })

        console.log("Files fetch response:", { data, error })

        if (error) {
            console.error("Supabase error:", error)
            throw error
        }

        return data || []
    } catch (error) {
        console.error("Error fetching files:", error)
        throw error
    }
}

export async function deleteFileAction(id: string): Promise<void> {
    const supabase = await createClient()
    
    const { error } = await supabase.from("files").delete().eq("id", id)
    if (error) throw error
}

