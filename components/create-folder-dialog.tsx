"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Folder as FolderType } from "@/types/database"

interface CreateFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: { name: string; description: string }) => void
  folder?: FolderType | null
}

export function CreateFolderDialog({ open, onOpenChange, onSubmit, folder }: CreateFolderDialogProps) {
  const [name, setName] = useState(folder?.name || "")
  const [description, setDescription] = useState(folder?.description || "")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onSubmit({ name: name.trim(), description: description.trim() })
      setName("")
      setDescription("")
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{folder ? "Edit Folder" : "Create New Folder"}</DialogTitle>
          <DialogDescription>
            {folder ? "Update your folder details below." : "Create a new folder to organize your CSV files."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter folder name"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter folder description (optional)"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{folder ? "Update" : "Create"} Folder</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
