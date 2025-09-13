"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, FolderPlus, Upload, ArrowLeft } from "lucide-react"
import { FolderCard } from "@/components/folder-card"
import { FileCard } from "@/components/file-card"
import { CreateFolderDialog } from "@/components/create-folder-dialog"
import { FileUploadDialog } from "@/components/file-upload-dialog"
import { CSVDataViewer } from "@/components/csv-data-viewer"
import { useFolders } from "@/hooks/use-folders"
import { useFiles } from "@/hooks/use-files"
import type { Folder, File } from "@/types/database"

export function DashboardPage() {
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [showUploadFile, setShowUploadFile] = useState(false)
  const [showDataViewer, setShowDataViewer] = useState(false)
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)
  const [viewingFile, setViewingFile] = useState<File | null>(null)

  const { folders, loading: foldersLoading, createFolder, updateFolder, deleteFolder } = useFolders()
  const { files, loading: filesLoading, uploadFile, deleteFile } = useFiles(selectedFolder?.id)

  const handleCreateFolder = async (data: { name: string; description: string }) => {
    if (editingFolder) {
      await updateFolder(editingFolder.id, data)
      setEditingFolder(null)
    } else {
      await createFolder(data)
    }
  }

  const handleEditFolder = (folder: Folder) => {
    setEditingFolder(folder)
    setShowCreateFolder(true)
  }

  const handleViewFile = (file: File) => {
    setViewingFile(file)
    setShowDataViewer(true)
  }

  const handleUploadFile = async (data: { name: string; description: string; file: globalThis.File }) => {
      await uploadFile({
        name: data.name,
        description: data.description,
        file: data.file as any // Cast to 'any' or update uploadFile to accept globalThis.File
      })
    }

  if (!selectedFolder) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">CSV File Manager</h1>
              <p className="text-muted-foreground mt-2">Organize and manage your CSV files in folders</p>
            </div>
            <Button onClick={() => setShowCreateFolder(true)}>
              <FolderPlus className="h-4 w-4 mr-2" />
              Create Folder
            </Button>
          </div>

          {foldersLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
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
                  onClick={setSelectedFolder}
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
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => setSelectedFolder(null)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
            </Button>
            <div>
              {/* <h1 className="text-3xl font-bold text-foreground">{selectedFolder.name}</h1> */}
              <p className="text-muted-foreground mt-1">{selectedFolder.name}</p>
            </div>
          </div>
          <Button onClick={() => setShowUploadFile(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload CSV
          </Button>
        </div>

        {filesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-12">
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No files yet</h3>
            <p className="text-muted-foreground mb-4">Upload your first CSV file to this folder</p>
            <Button onClick={() => setShowUploadFile(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload CSV File
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {files.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                onView={handleViewFile}
                onEdit={() => {}} // TODO: Implement file editing
                onDelete={deleteFile}
              />
            ))}
          </div>
        )}

        <FileUploadDialog
          open={showUploadFile}
          onOpenChange={setShowUploadFile}
          onSubmit={handleUploadFile}
          folderId={selectedFolder.id}
        />

        <CSVDataViewer open={showDataViewer} onOpenChange={setShowDataViewer} file={viewingFile} />
      </div>
    </div>
  )
}
