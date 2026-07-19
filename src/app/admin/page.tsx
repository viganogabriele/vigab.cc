import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { Dashboard } from "@/components/dashboard"
import { authOptions } from "@/lib/auth"

export default async function AdminPage() {
  const session = await getServerSession(authOptions)

  // Skip the Google sign-in gate when running the local dev server so the
  // dashboard can be worked on without OAuth. Production builds set
  // NODE_ENV=production, so this bypass never applies to a deployed app.
  if (!session && process.env.NODE_ENV !== "development") {
    redirect("/api/auth/signin?callbackUrl=/admin")
  }

  return <Dashboard />
}
