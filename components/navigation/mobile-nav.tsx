"use client"

import type React from "react"

import { useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { BarChart3, Users, Settings, Home, Database, TrendingUp, Shield, Menu , Crown} from "lucide-react"

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
  // {
  //   title: "Analytics",
  //   href: "/dashboard/analytics",
  //   icon: BarChart3,
  //   roles: ["admin", "user"],
  // },
  // // {
  // //   title: "Reports",
  // //   href: "/dashboard/reports",
  // //   icon: TrendingUp,
  // //   roles: ["admin", "user"],
  // // },
  // // {
  // //   title: "Data Sources",
  // //   href: "/dashboard/data-sources",
  // //   icon: Database,
  // //   roles: ["admin", "user"],
  // // },
  // {
  //   title: "User Management",
  //   href: "/dashboard/users",
  //   icon: Users,
  //   roles: ["admin"],
  //   badge: "Admin",
  // },
  // {
  //   title: "Billing",
  //   href: "/dashboard/payments",
  //   icon: Crown,
  //   roles: ["admin", "user"],
  // },
  // {
  //   title: "Profile Settings",
  //   href: "/dashboard/profile",
  //   icon: Settings,
  //   roles: ["admin", "user"],
  // },
]

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const { user, profile, loading } = useAuth()
  const pathname = usePathname()

  // Always show the menu button, but handle content based on state
  const filteredNavItems = profile ? navItems.filter((item) => item.roles.includes(profile.role)) : []

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center px-6 border-b border-border">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-semibold text-lg">AI BI Platform</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            {loading ? (
              // Loading skeleton
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded animate-pulse" />
              ))
            ) : !user ? (
              // No user
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Please sign in</p>
              </div>
            ) : !profile ? (
              // User but no profile
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Loading profile...</p>
              </div>
            ) : (
              // Normal navigation
              filteredNavItems.map((item) => {
                const isActive = pathname === item.href
                const Icon = item.icon

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
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
              })
            )}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  )
}
