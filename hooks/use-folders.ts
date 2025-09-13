"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Folder } from "@/types/database"
import { useToast } from "@/hooks/use-toast"

export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const { toast } = useToast()

  const fetchFolders = async () => {
    try {
      const { data, error } = await supabase.from("folders").select("*").order("created_at", { ascending: false })

      if (error) throw error
      setFolders(data || [])
    } catch (error) {
      console.error("Error fetching folders:", error)
      toast({
        title: "Error",
        description: "Failed to fetch folders",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const createFolder = async (data: { name: string; description: string }) => {
    try {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error("Not authenticated")

      const { data: newFolder, error } = await supabase
        .from("folders")
        .insert([
          {
            name: data.name,
            description: data.description,
            user_id: user.user.id,
          },
        ])
        .select()
        .single()

      if (error) throw error

      setFolders((prev) => [newFolder, ...prev])
      toast({
        title: "Success",
        description: "Folder created successfully",
      })
    } catch (error) {
      console.error("Error creating folder:", error)
      toast({
        title: "Error",
        description: "Failed to create folder",
        variant: "destructive",
      })
    }
  }

  const updateFolder = async (id: string, data: { name: string; description: string }) => {
    try {
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

      setFolders((prev) => prev.map((folder) => (folder.id === id ? updatedFolder : folder)))
      toast({
        title: "Success",
        description: "Folder updated successfully",
      })
    } catch (error) {
      console.error("Error updating folder:", error)
      toast({
        title: "Error",
        description: "Failed to update folder",
        variant: "destructive",
      })
    }
  }

  const deleteFolder = async (id: string) => {
    try {
      const { error } = await supabase.from("folders").delete().eq("id", id)

      if (error) throw error

      setFolders((prev) => prev.filter((folder) => folder.id !== id))
      toast({
        title: "Success",
        description: "Folder deleted successfully",
      })
    } catch (error) {
      console.error("Error deleting folder:", error)
      toast({
        title: "Error",
        description: "Failed to delete folder",
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    fetchFolders()
  }, [])

  return {
    folders,
    loading,
    createFolder,
    updateFolder,
    deleteFolder,
    refetch: fetchFolders,
  }
}
