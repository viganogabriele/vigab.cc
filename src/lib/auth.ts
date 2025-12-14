import type { AuthOptions } from "next-auth"
import Google from "next-auth/providers/google"
import { env } from "@/env"

const ALLOWED_EMAIL = "gabriviga2005@gmail.com"

export const authOptions: AuthOptions = {
  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  secret: env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user }) {
      if (user.email === ALLOWED_EMAIL) {
        return true
      } else {
        console.log(`Access denied for user: ${user.email}`)
        return false
      }
    },
  },
}
