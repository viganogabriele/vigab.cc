import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { Dashboard } from "@/components/dashboard"
import { authOptions } from "@/lib/auth"

export default async function AdminPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect("/api/auth/signin?callbackUrl=/admin")
  }

  return <Dashboard />
}
