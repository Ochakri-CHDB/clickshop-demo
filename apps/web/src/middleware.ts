import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  if (!req.auth) {
    const signInUrl = new URL("/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
});

// Only the Next.js pages are guarded here. API routes self-guard
// (lib/api-guard), and LibreChat paths (proxied, see next.config.js) use
// LibreChat's own authentication.
export const config = {
  matcher: [
    "/((?!api|_next|icon|auth/|otel|c/|login|register|forgot-password|reset-password|verify|oauth|share|assets|images|fonts|dist|.*\\..*).*)",
  ],
};
