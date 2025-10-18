"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Plus, FolderPlus, Home } from "lucide-react"
import { FolderCard } from "@/components/folder-card"
import { CreateFolderDialog } from "@/components/create-folder-dialog"
import { useFolders } from "@/hooks/use-folders"
import type { Folder } from "@/types/database"
import { useRouter } from "next/navigation"
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbPage } from "@/components/ui/breadcrumb"

export function DashboardContent() {
  const router = useRouter();
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)
  const [creatingFolder, setCreatingFolder] = useState(false)

  const { folders, loading: foldersLoading, createFolder, updateFolder, deleteFolder } = useFolders()

  const LoadingGrid = ({ count }: { count: number }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-lg" />
      ))}
    </div>
  )

  const handleCreateFolder = async (data: { name: string; description: string }) => {
    console.log("Creating folder...", data)
    setCreatingFolder(true)
    try {
      if (editingFolder) {
        console.log("Updating folder", editingFolder.id)
        await updateFolder(editingFolder.id, data)
        setEditingFolder(null)
      } else {
        console.log("Creating new folder")
        await createFolder(data)
      }
    } catch (err) {
      console.error("Error in handleCreateFolder:", err)
    } finally {
      console.log("Finished folder create/update")
      setCreatingFolder(false)
    }
  }


  const handleEditFolder = (folder: Folder) => {
    setEditingFolder(folder)
    setShowCreateFolder(true)
  }

  const handleFolderClick = (folder: Folder) => {
    router.push(`/dashboard/${folder.id}`);
  }

  return (
    <div className="container mx-auto p-6">
      {/* Breadcrumb Navigation */}
      <div className="mb-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage className="flex items-center gap-1">
                <Home className="h-4 w-4" />
                <span className="font-medium">Dashboard</span>
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">CSV File Manager</h1>
          <p className="text-muted-foreground mt-2">Organize and manage your CSV files in folders</p>
        </div>
        <Button onClick={() => setShowCreateFolder(true)} disabled={creatingFolder}>
          <FolderPlus className="h-4 w-4 mr-2" />
          {creatingFolder ? "Creating..." : "Create Folder"}
        </Button>
      </div>

      {foldersLoading || creatingFolder ? (
        <LoadingGrid count={8} />
      ) : folders.length === 0 ? (
        <div className="text-center py-12">
          <FolderPlus className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No folders yet</h3>
          <p className="text-muted-foreground mb-4">Create your first folder to start organizing CSV files</p>
          <Button onClick={() => setShowCreateFolder(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create First Folder
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              onClick={handleFolderClick}
              onEdit={handleEditFolder}
              onDelete={deleteFolder}
            />
          ))}
        </div>
      )}

      <CreateFolderDialog
        open={showCreateFolder}
        onOpenChange={(open) => {
          setShowCreateFolder(open)
          if (!open) setEditingFolder(null)
        }}
        onSubmit={handleCreateFolder}
        folder={editingFolder}
      />
    </div>
  )
}
