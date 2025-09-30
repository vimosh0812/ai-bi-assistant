"use client"

import { useState, useEffect } from "react"
import type { Folder } from "@/types/database"
import { useToast } from "@/hooks/use-toast"
import { fetchFoldersAction, createFolderAction, updateFolderAction, deleteFolderAction } from "@/actions/folders-actions"

export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const fetchFolders = async () => {
    try {
      const data = await fetchFoldersAction();
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
    console.log("useFolders: createFolder called", data)

    try {
      const newFolder = await createFolderAction(data)
      setFolders((prev) => [newFolder, ...prev])
    } catch (error: any) {
      console.error("Error creating folder:", error.message || error)
      throw error
    }
  }

  const updateFolder = async (id: string, data: { name: string; description: string }) => {
    try {
      const updatedFolder = await updateFolderAction(id, data)
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
      await deleteFolderAction(id)
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
