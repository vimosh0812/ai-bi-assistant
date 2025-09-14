"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, MoreVertical, Edit, Trash2, Eye, Bot } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { File as FileType } from "@/types/database"

interface FileCardProps {
  file: FileType
  onEdit: (file: FileType) => void
  onDelete: (fileId: string) => void
  onView: (file: FileType) => void
  onShowData?: (file: FileType) => void
}

export function FileCard({ file, onEdit, onDelete, onView, onShowData }: FileCardProps) {
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-2" onClick={() => onView(file)}>
          <FileText className="h-5 w-5 text-green-600" />
          <CardTitle className="text-sm font-medium">{file.name}</CardTitle>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(file)}>
              <Bot className="mr-2 h-4 w-4" />
              Chat with Data
            </DropdownMenuItem>
            {onShowData && (
              <DropdownMenuItem onClick={() => onShowData(file)}>
                <Eye className="mr-2 h-4 w-4" />
                View Raw Data
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onEdit(file)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(file.id)} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent onClick={() => onView(file)}>
        <CardDescription className="text-xs">{file.description || "No description"}</CardDescription>
        <p className="text-xs text-muted-foreground mt-2">Created {new Date(file.created_at).toLocaleDateString()}</p>
      </CardContent>
    </Card>
  )
}
