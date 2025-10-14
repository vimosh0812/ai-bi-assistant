import DashboardLayout from "@/components/layouts/dashboard-layout"
import { DashboardContent } from "@/components/dashboard/dashboard-content"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AnalyticsContent from "@/components/analytics/analytics-content"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/sign-in")

  return (
    <DashboardLayout>
      <AnalyticsContent />
    </DashboardLayout>
  )
}
