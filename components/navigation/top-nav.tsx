"use client"

import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { MobileNav } from "./mobile-nav"
import Link from "next/link"
import { LogOut, User, Bell } from "lucide-react"

export function TopNav() {
  const { user, profile, loading, signOut } = useAuth()

  // Show loading or missing profile state
  if (loading || !profile) {
    return (
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center space-x-4">
            <MobileNav />
            <div className="hidden md:block space-y-1">
              <div className="h-5 w-48 bg-muted rounded animate-pulse" />
              <div className="h-4 w-64 bg-muted rounded animate-pulse" />
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon">
              <Bell className="h-4 w-4" />
            </Button>
            <div className="h-10 w-10 bg-muted rounded-full animate-pulse" />
          </div>
        </div>
      </header>
    )
  }

  // Don't render if no user (should redirect via middleware)
  if (!user) {
    return null
  }

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        <div className="flex items-center space-x-4">
          <MobileNav />
          <div className="hidden md:block">
            <h1 className="text-lg font-semibold">Welcome back, {profile.full_name || "User"}</h1>
            <p className="text-sm text-muted-foreground">
              {profile.role === "admin"
                ? "Manage your business intelligence platform"
                : "Explore your analytics and insights"}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <Button variant="ghost" size="icon">
            <Bell className="h-4 w-4" />
          </Button>
          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button
                variant="ghost"
                className="flex items-center justify-center h-10 w-10 rounded-full p-0"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={profile.avatar_url || ""} />
                  <AvatarFallback>
                    {profile.full_name
                      ? profile.full_name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                      : profile.email?.[0]?.toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56 mt-1">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{profile.full_name || "User"}</p>
                  <p className="text-xs leading-none text-muted-foreground truncate">{profile.email}</p>
                  <Badge
                    variant={profile.role === "admin" ? "default" : "secondary"}
                    className="text-xs w-fit mt-1"
                  >
                    {profile.role}
                  </Badge>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link href="/dashboard/profile" className="flex items-center w-full">
                  <User className="mr-2 h-4 w-4" />
                  Profile Settings
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={handleSignOut}
                className="flex items-center text-destructive w-full"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
