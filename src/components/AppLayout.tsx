import { Suspense, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { MobileNav } from "./MobileNav";
import { Breadcrumbs } from "./Breadcrumbs";

// Skeleton shown while a lazy-loaded route chunk is still downloading. Keeps
// the sidebar and header visible so only the content area flickers — much
// less jarring than the whole page going blank between navigations.
function RouteSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-lg bg-muted/30 animate-pulse" />
    </div>
  );
}

export function AppLayout() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Reset scroll on every route change. The <main> element scrolls
  // (overflow-auto), not window — so window.scrollTo alone isn't enough.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "auto" });
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      {/* Skip-link: hidden until focused so keyboard users can bypass the
          50-link sidebar on every page load. Sighted users never see it. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to main content
      </a>
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        <MobileNav />
        <main id="main-content" tabIndex={-1} ref={mainRef} className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          <Breadcrumbs />
          {/* Suspense lives INSIDE the layout so the sidebar and header stay
              mounted while the next page's JS chunk downloads. Without this,
              clicking any sidebar link blanks the whole screen until the
              chunk arrives (jarring on slow connections). */}
          <Suspense fallback={<RouteSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
