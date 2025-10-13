import FileAnalyticsPage from "@/components/analytics/analytics-content";

import DashboardLayout from "@/components/layouts/dashboard-layout"
import { DashboardContent } from "@/components/dashboard/dashboard-content"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function FilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/sign-in")

  return (
    <DashboardLayout>
      <FileAnalyticsPage />
    </DashboardLayout>
  )
}
