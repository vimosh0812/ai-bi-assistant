import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Sidebar } from "@/components/navigation/sidebar"
import { TopNav } from "@/components/navigation/top-nav"
import { AuthProvider } from "@/hooks/use-auth"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export async function DashboardLayout({ children }: DashboardLayoutProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/auth/sign-in")

  return (
    <AuthProvider initialUser={user}>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopNav />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </AuthProvider>
  )
}
