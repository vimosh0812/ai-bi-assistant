"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Upload, ArrowLeft, Home } from "lucide-react"
import { FileCard } from "@/components/file-card"
import { CSVDataViewer } from "@/components/csv-data-viewer"
import { CSVChatbot } from "@/components/csv-chatbot"
import { FileUploadScreen } from "@/components/file-upload-screen"
import { useFiles } from "@/hooks/use-files"
import { useFolders } from "@/hooks/use-folders"
import type { Folder, File } from "@/types/database"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"

interface FolderContentProps {
  folderId: string
}

export function FolderContent({ folderId }: FolderContentProps) {
  const router = useRouter()
  const supabase = createClient()
  const [folder, setFolder] = useState<Folder | null>(null)
  const [uploadScreenActive, setUploadScreenActive] = useState(false)
  const [showDataViewer, setShowDataViewer] = useState(false)
  const [viewingFile, setViewingFile] = useState<File | null>(null)
  const [chatbotFile, setChatbotFile] = useState<File | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [loading, setLoading] = useState(true)

  const { files, loading: filesLoading, uploadFile, deleteFile } = useFiles(folderId)

  // Fetch folder details
  useEffect(() => {
    const fetchFolder = async () => {
      const { data, error } = await supabase
        .from("folders")
        .select("*")
        .eq("id", folderId)
        .single()

      if (error) {
        console.error("Error fetching folder:", error)
        router.push("/dashboard")
        return
      }

      setFolder(data)
      setLoading(false)
    }

    fetchFolder()
  }, [folderId, router, supabase])

  const LoadingGrid = ({ count }: { count: number }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-lg" />
      ))}
    </div>
  )

  const handleViewFile = (file: File) => {
    router.push(`/dashboard/${folderId}/${file.id}`)
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
    setUploadScreenActive(false)
  }

  const handleCloseChatbot = () => {
    setChatbotFile(null)
    setViewingFile(null)
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <LoadingGrid count={6} />
      </div>
    )
  }

  if (!folder) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-foreground mb-2">Folder not found</h3>
          <p className="text-muted-foreground mb-4">The folder you're looking for doesn't exist</p>
          <Button onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  if (uploadScreenActive) {
    return (
      <FileUploadScreen
        folderId={folderId}
        onSubmit={handleUploadFile}
        onBack={() => setUploadScreenActive(false)}
      />
    )
  }

  return (
    <div className="container mx-auto p-6">
      {/* Breadcrumb Navigation */}
      <div className="mb-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink 
                href="/dashboard" 
                className="flex items-center gap-1 hover:text-foreground"
              >
                <Home className="h-4 w-4" />
                Dashboard
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="flex items-center gap-1">
                <span className="font-medium">{folder.name}</span>
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          {/* <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button> */}
          <div>
            <h1 className="text-3xl font-bold text-foreground">{folder.name}</h1>
            <p className="text-muted-foreground mt-2">{folder.description}</p>
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
