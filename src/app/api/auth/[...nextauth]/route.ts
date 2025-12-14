import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth"

const handler = NextAuth(authOptions)

// Export the handler for Next.js API Routes (handles GET/POST requests)
export { handler as GET, handler as POST }
