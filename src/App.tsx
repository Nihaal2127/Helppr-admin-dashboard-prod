import React, { useEffect, useState, Suspense } from "react";

import { useLocation, useNavigate, matchPath } from "react-router-dom";

import clsx from "clsx";

import AppRoutes from "./routes/AppRoutes";

import { getLocalStorage } from "./lib/global/localStorageHelper";

import { AppConstant, UserRole } from "./lib/global/AppConstant";

import { useViewport } from "./lib/global/useViewPort";

import { ROUTES } from "./routes/Routes";

import { ToastContainer } from "react-toastify";

import { setNavigate } from "./helper/navigation";

import { runWhenIdle } from "./lib/global/runWhenIdle";

import Sidebar from "./layout/Sidebar";

import "react-toastify/dist/ReactToastify.css";

import "bootstrap/dist/css/bootstrap.min.css";

import "bootstrap-icons/font/bootstrap-icons.css";

import "./assets/scss/App.scss";

import "./assets/scss/Responsive.scss";

import "./assets/scss/loader.scss";

import "./assets/scss/Sidebar.scss";

import { routes } from "./routes/Routes";

import { refreshSessionAccessibleMenuKeys } from "./services/userService";

import {

  SidebarProvider,

  SidebarEffects,

  SIDEBAR_MOBILE_BREAKPOINT,

  useSidebar,

} from "./context/SidebarContext";

import MobileAppTopBar from "./components/MobileAppTopBar";
import { ChatProvider } from "./lib/chat/ChatProvider";



function AppLayoutChrome() {

  const sidebar = useSidebar();



  if (!sidebar?.isMobileLayout) return null;



  return (

    <>

      <MobileAppTopBar />

      {sidebar.isOpen && (

        <button

          type="button"

          className="sidebar-backdrop"

          aria-label="Close menu"

          onClick={sidebar.closeSidebar}

        />

      )}

    </>

  );

}



function AppLayoutShell({

  showSidebarChrome,

  sidebarAccessVersion,

  isAuthenticated,

  children,

}: {

  showSidebarChrome: boolean;

  sidebarAccessVersion: number;

  isAuthenticated: boolean;

  children: React.ReactNode;

}) {

  const sidebar = useSidebar();



  return (

    <div

      className={clsx(

        "custom-app-layout",

        showSidebarChrome ? "with-sidebar" : "without-sidebar",

        sidebar?.isMobileLayout && sidebar.isOpen && "sidebar-open"

      )}

    >

      {showSidebarChrome && (

        <aside className="custom-sidebar">

          <Suspense fallback={null}>

            <Sidebar key={`sidebar-access-${sidebarAccessVersion}`} />

          </Suspense>

        </aside>

      )}



      <main className="custom-content">

        {showSidebarChrome && <AppLayoutChrome />}

        <Suspense fallback={null}>
          {isAuthenticated ? (
            <ChatProvider>
              <AppRoutes isAuthenticated={isAuthenticated} />
            </ChatProvider>
          ) : (
            <AppRoutes isAuthenticated={isAuthenticated} />
          )}
          {children}
        </Suspense>

      </main>

    </div>

  );

}



function App() {

  const { width } = useViewport();

  const location = useLocation();

  const navigate = useNavigate();

  useEffect(() => {
    setNavigate(navigate);
  }, [navigate]);

  const is404Page = location.pathname === "/404";

  const is500Page = location.pathname === "/500";

  const isAuthRoute = location.pathname.includes("/auth");

  const [isRouteProtected, setIsRouteProtected] = useState<boolean>(false);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(

    !!getLocalStorage(AppConstant.authToken)

  );

  const [sidebarAccessVersion, setSidebarAccessVersion] = useState(0);



  const isMobileLayout = width < SIDEBAR_MOBILE_BREAKPOINT;

  const showSidebarChrome =

    !isAuthRoute && !is404Page && !is500Page && isRouteProtected;



  useEffect(() => {

    if (!isAuthenticated || isAuthRoute) return;

    return runWhenIdle(() => {

      void import("./services/firebaseMessagingService").then(

        ({ requestPermission }) => requestPermission()

      );

    });

  }, [isAuthenticated, isAuthRoute]);



  useEffect(() => {

    if (isMobileLayout) {

      document.body.classList.add("is-mobile");

    } else {

      document.body.classList.remove("is-mobile");

    }

  }, [isMobileLayout]);



  useEffect(() => {

    window.scrollTo(0, 0);

  }, [location.pathname]);



  useEffect(() => {

    const token = getLocalStorage(AppConstant.authToken);

    const currentRoute = routes.find((route) =>

      matchPath(route.path, location.pathname)

    );

    const isRouteProtected = currentRoute?.isProtected;

    setIsRouteProtected(isRouteProtected ? isRouteProtected : false);



    if (token) {

      setIsAuthenticated(true);

      if (location.pathname === ROUTES.LOGIN.path) {

        navigate(ROUTES.DASHBOARD.path, { replace: true });

      }

    } else {

      setIsAuthenticated(false);

      if (isRouteProtected) {

        navigate(ROUTES.LOGIN.path, { replace: true });

      }

    }

  }, [location.pathname, navigate]);



  useEffect(() => {

    if (!isAuthenticated || !isRouteProtected || isAuthRoute) return;

    let cancelled = false;

    void (async () => {

      const role = String(getLocalStorage(AppConstant.userRole) ?? "").trim();
      const changed = await refreshSessionAccessibleMenuKeys({
        force: role === UserRole.EMPLOYEE,
      });

      if (!cancelled && changed) {

        setSidebarAccessVersion((v) => v + 1);

      }

    })();

    return () => {

      cancelled = true;

    };

  }, [isAuthenticated, isRouteProtected, isAuthRoute]);



  const layout = (

    <AppLayoutShell

      showSidebarChrome={showSidebarChrome}

      sidebarAccessVersion={sidebarAccessVersion}

      isAuthenticated={isAuthenticated}

    >

      <ToastContainer />

    </AppLayoutShell>

  );



  if (!showSidebarChrome) {

    return layout;

  }



  return (

    <SidebarProvider isMobileLayout={isMobileLayout}>

      <SidebarEffects pathname={location.pathname} />

      {layout}

    </SidebarProvider>

  );

}



export default App;

