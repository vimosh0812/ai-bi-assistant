"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Plus, FolderPlus, Upload, ArrowLeft } from "lucide-react"
import { FolderCard } from "@/components/folder-card"
import { FileCard } from "@/components/file-card"
import { CreateFolderDialog } from "@/components/create-folder-dialog"
import { CSVDataViewer } from "@/components/csv-data-viewer"
import { CSVChatbot } from "@/components/csv-chatbot"
import { FileUploadScreen } from  "@/components/file-upload-screen"
import { useFolders } from "@/hooks/use-folders"
import { useFiles } from "@/hooks/use-files"
import type { Folder, File } from "@/types/database"

export function DashboardContent() {
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [uploadScreenActive, setUploadScreenActive] = useState(false) // <-- replaces dialog
  const [showDataViewer, setShowDataViewer] = useState(false)
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)
  const [viewingFile, setViewingFile] = useState<File | null>(null)
  const [chatbotFile, setChatbotFile] = useState<File | null>(null)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)

  const { folders, loading: foldersLoading, createFolder, updateFolder, deleteFolder } = useFolders()
  const { files, loading: filesLoading, uploadFile, deleteFile } = useFiles(selectedFolder?.id)

  const LoadingGrid = ({ count }: { count: number }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-lg" />
      ))}
    </div>
  )

  const handleCreateFolder = async (data: { name: string; description: string }) => {
    setCreatingFolder(true)
    if (editingFolder) {
      await updateFolder(editingFolder.id, data)
      setEditingFolder(null)
    } else {
      await createFolder(data)
    }
    setCreatingFolder(false)
  }

  const handleEditFolder = (folder: Folder) => {
    setEditingFolder(folder)
    setShowCreateFolder(true)
  }

  const handleViewFile = (file: File) => {
    setViewingFile(file)
    setChatbotFile(file)
  }

  const handleViewData = (file: File) => {
    setViewingFile(file)
    setShowDataViewer(true)
  }

  const handleUploadFile = async (data: { name: string; description: string; file: globalThis.File }) => {
    setUploadingFile(true)
    await uploadFile({
      name: data.name,
      description: data.description,
      file: data.file as any,
    })
    setUploadingFile(false)
    setUploadScreenActive(false) // close upload screen after successful upload
  }

  const handleCloseChatbot = () => {
    setChatbotFile(null)
    setViewingFile(null)
  }

  // ---------------- FOLDER VIEW ----------------
  if (!selectedFolder) {
    return (
      <div className="container mx-auto p-6">
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
    )
  }

  // ---------------- FILE VIEW ----------------
  if (uploadScreenActive) {
    return (
      <FileUploadScreen
        folderId={selectedFolder.id}
        onSubmit={handleUploadFile}
        onBack={() => setUploadScreenActive(false)}
      />
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" onClick={() => setSelectedFolder(null)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
          </Button>
          <div>
            <p className="text-black mt-1">{selectedFolder.name}</p>
          </div>
        </div>
        <Button onClick={() => setUploadScreenActive(true)} disabled={uploadingFile}>
          <Upload className="h-4 w-4 mr-2" />
          {uploadingFile ? "Uploading..." : "Upload CSV"}
        </Button>
      </div>

      {filesLoading || uploadingFile ? (
        <LoadingGrid count={6} />
      ) : files.length === 0 ? (
        <div className="text-center py-12">
          <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No files yet</h3>
          <p className="text-muted-foreground mb-4">Upload your first CSV file to this folder</p>
          <Button onClick={() => setUploadScreenActive(true)}>
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
              onEdit={() => {}}
              onDelete={deleteFile}
            />
          ))}
        </div>
      )}

      <CSVDataViewer open={showDataViewer} onOpenChange={setShowDataViewer} file={viewingFile} />

      {chatbotFile && <CSVChatbot file={chatbotFile} onClose={handleCloseChatbot} onViewData={handleViewData} />}
    </div>
  )
}
