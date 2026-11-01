import { NextRequest, NextResponse } from "next/server";

const legacyCustomerRoutes = [
  "/book", "/invite", "/order", "/orders", "/products",
  "/request", "/requests", "/saved", "/patterns",
];

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (legacyCustomerRoutes.some(route => path === route || path.startsWith(route + "/")) ||
      path === "/admin/storefront" || path.startsWith("/admin/storefront/") ||
      path === "/admin/community" || path.startsWith("/admin/community/")) {
    const destination = request.nextUrl.clone();
    destination.pathname = path.startsWith("/admin/") ? "/admin" : "/";
    destination.search = "";
    return NextResponse.redirect(destination, 307);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|big-brothers-icon.svg).*)"],
};
