import { redirect } from "next/navigation"
import { Dashboard } from "@/components/dashboard"

export default async function AdminPage() {
  const allowAnonymousLocalAdmin =
    process.env.NODE_ENV === "development" &&
    process.env.ALLOW_ANONYMOUS_LOCAL_ADMIN === "true"

  if (allowAnonymousLocalAdmin) {
    return <Dashboard />
  }

  const [{ getServerSession }, { authOptions }] = await Promise.all([
    import("next-auth"),
    import("@/lib/auth"),
  ])
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect("/api/auth/signin?callbackUrl=/admin")
  }

  return <Dashboard />
}
