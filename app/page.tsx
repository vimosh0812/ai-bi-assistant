import { redirect } from "next/navigation"

export default function HomePage() {
  // Redirect to sign in page
  redirect("/dashboard")
}
