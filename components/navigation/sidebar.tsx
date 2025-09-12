"use client"

import type React from "react"

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
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { BarChart3, Users, Settings, Home, Database, TrendingUp, Shield, LogOut, User, ChevronDown } from "lucide-react"

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  roles: ("admin" | "user")[]
  badge?: string
}

const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: Home,
    roles: ["admin", "user"],
  },
  {
    title: "Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
    roles: ["admin", "user"],
  },
  // {
  //   title: "Reports",
  //   href: "/dashboard/reports",
  //   icon: TrendingUp,
  //   roles: ["admin", "user"],
  // },
  // {
  //   title: "Data Sources",
  //   href: "/dashboard/data-sources",
  //   icon: Database,
  //   roles: ["admin", "user"],
  // },
  {
    title: "User Management",
    href: "/dashboard/users",
    icon: Users,
    roles: ["admin"],
    badge: "Admin",
  },
  // {
  //   title: "System Settings",
  //   href: "/dashboard/settings",
  //   icon: Shield,
  //   roles: ["admin"],
  //   badge: "Admin",
  // },
  {
    title: "Profile Settings",
    href: "/dashboard/profile",
    icon: Settings,
    roles: ["admin", "user"],
  },
]

export function Sidebar() {
  const { user, profile, signOut } = useAuth()
  const pathname = usePathname()

  if (!user || !profile) {
    return null
  }

  const filteredNavItems = navItems.filter((item) => item.roles.includes(profile.role))

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <div className="flex h-full w-64 flex-col bg-card border-r border-border">
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-6 border-b border-border">
        <div className="flex items-center space-x-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg">AI BI Platform</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {filteredNavItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground",
              )}
            >
              <div className="flex items-center space-x-3">
                <Icon className="h-4 w-4" />
                <span>{item.title}</span>
              </div>
              {item.badge && (
                <Badge variant="secondary" className="text-xs">
                  {item.badge}
                </Badge>
              )}
            </Link>
          )
        })}
      </nav>

{/* User Profile */}
      <div className="border-t border-border p-4 mt-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex w-full items-center space-x-3 p-2 rounded-lg">
              <Avatar className="h-8 w-8">
                <AvatarImage src={profile.avatar_url || ""} />
                <AvatarFallback>
                  {profile.full_name
                    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase()
                    : profile.email?.[0]?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium">{profile.full_name || "User"}</div>
                <div className="text-xs text-muted-foreground truncate">{profile.email}</div>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 mt-1">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile" className="flex items-center">
                <User className="mr-2 h-4 w-4" />
                Profile Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="flex items-center text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

    </div>
  )
}
