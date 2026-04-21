import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { MobileNav } from "./MobileNav";
import { Breadcrumbs } from "./Breadcrumbs";

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
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        <MobileNav />
        <main ref={mainRef} className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          <Breadcrumbs />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
