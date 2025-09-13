"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Folder, MoreVertical, Edit, Trash2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { Folder as FolderType } from "@/types/database"

interface FolderCardProps {
  folder: FolderType
  onEdit: (folder: FolderType) => void
  onDelete: (folderId: string) => void
  onClick: (folder: FolderType) => void
}

export function FolderCard({ folder, onEdit, onDelete, onClick }: FolderCardProps) {
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-2" onClick={() => onClick(folder)}>
          <Folder className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-sm font-medium">{folder.name}</CardTitle>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(folder)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(folder.id)} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent onClick={() => onClick(folder)}>
        <CardDescription className="text-xs">{folder.description || "No description"}</CardDescription>
        <p className="text-xs text-muted-foreground mt-2">Created {new Date(folder.created_at).toLocaleDateString()}</p>
      </CardContent>
    </Card>
  )
}
