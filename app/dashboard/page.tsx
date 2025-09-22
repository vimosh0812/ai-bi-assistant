// app/dashboard/page.tsx
import DashboardLayout from "@/components/layouts/dashboard-layout"
import { DashboardContent } from "@/components/dashboard/dashboard-content"
import { createServerSideClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function DashboardPage() {
  const supabase = createServerSideClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/sign-in")

  return (
    <DashboardLayout>
      <DashboardContent />
    </DashboardLayout>
  )
}
