import DashboardLayout from "@/components/layouts/dashboard-layout"
import { ChartView } from "@/components/charts/chart-view"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function ChartPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/sign-in")

  return (
    <DashboardLayout>
      <ChartView />
    </DashboardLayout>
  )
}

