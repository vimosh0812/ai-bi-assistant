import DashboardLayout from "@/components/layouts/dashboard-layout"
import { FolderContent } from "@/components/dashboard/folder-content"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

interface FolderPageProps {
  params: {
    folderId: string
  }
}

export default async function FolderPage({ params }: FolderPageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/sign-in")

  return (
    <DashboardLayout>
      <FolderContent folderId={params.folderId} />
    </DashboardLayout>
  )
}
