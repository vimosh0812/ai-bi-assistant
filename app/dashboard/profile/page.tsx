"use client"

import type React from "react"
import { useState } from "react"
import { DashboardLayout } from "@/components/layouts/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"
import { Camera, Save, LogOut } from "lucide-react"

export default function ProfilePage() {
  const { profile, refreshProfile, signOut } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [fullName, setFullName] = useState(profile?.full_name || "")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const supabase = createClient()

  // Update profile name
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return

    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", profile.id)
      if (error) throw error
      await refreshProfile()
      setSuccess("Profile updated successfully!")
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  // Sign out
  const handleSignOut = async () => {
    if (confirm("Are you sure you want to sign out?")) {
      await signOut()
    }
  }

const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
  if (!e.target.files || e.target.files.length === 0) return
  const file = e.target.files[0]

  setUploading(true)
  setError(null)
  setSuccess(null)

  const filename = `${profile?.id}/avatar-${Date.now()}-${file.name}`

  try {
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from("avatars")
      .upload(filename, file, {
        cacheControl: "3600",
        upsert: true,
      })
    if (error) {
      setError(error.message)
      setUploading(false)
      return
    }
    console.log("Upload data:", data)
    // Get public URL
    const { data: urlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(filename)
    const publicUrl = urlData?.publicUrl
    console.log("Public URL:", publicUrl)
    if (!publicUrl) {
      setError("Failed to get avatar URL")
      setUploading(false)
      return
    }
    
    // Update profile with avatar URL
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", profile?.id)
    console.log("Profile update error:", updateError)
    if (updateError) {
      setError(updateError.message)
      setUploading(false)
      return
    }
    setSuccess("Avatar uploaded successfully!")
    await refreshProfile()
  } catch (error: unknown) {
    setError(error instanceof Error ? error.message : "An error occurred during upload")
  } finally {
    setUploading(false)
  }
}
  if (!profile) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
          <p className="text-muted-foreground">Manage your account settings and preferences</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Profile Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Profile Overview</CardTitle>
              <CardDescription>Your account information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center space-y-4">
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={profile.avatar_url || ""} />
                    <AvatarFallback>
                      {profile.full_name
                        ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase()
                        : profile.email?.[0]?.toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  {/* Upload Button */}
                  <label className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full cursor-pointer bg-transparent flex items-center justify-center border border-gray-300">
                    <Camera className="h-4 w-4" />
                    <input type="file" className="hidden" accept="image/*" onChange={handleUploadAvatar} />
                  </label>
                </div>
                <div className="text-center">
                  <h3 className="font-medium">{profile.full_name || "User"}</h3>
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                  <Badge variant={profile.role === "admin" ? "default" : "secondary"} className="mt-2">
                    {profile.role}
                  </Badge>
                </div>
              </div>
              {uploading && <p className="text-sm text-muted-foreground mt-2">Uploading avatar...</p>}
              {error && <p className="text-sm text-destructive mt-2">{error}</p>}
              {success && <p className="text-sm text-green-600 mt-2">{success}</p>}
            </CardContent>
          </Card>

          {/* Edit Profile */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Edit Profile</CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter your full name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" value={profile.email} disabled className="bg-muted" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Input id="role" value={profile.role} disabled className="bg-muted" />
                </div>

                <Button type="submit" disabled={isLoading}>
                  <Save className="mr-2 h-4 w-4" />
                  {isLoading ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>View your account details and activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-sm font-medium">Account Created</Label>
                <p className="text-sm text-muted-foreground">{new Date(profile.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Last Updated</Label>
                <p className="text-sm text-muted-foreground">{new Date(profile.updated_at).toLocaleDateString()}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">User ID</Label>
                <p className="text-sm text-muted-foreground font-mono">{profile.id}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Account Status</Label>
                <Badge variant="default" className="mt-1">
                  Active
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sign Out Button */}
        <div className="mt-6 flex justify-end">
          <Button variant="destructive" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </DashboardLayout>
  )
}
