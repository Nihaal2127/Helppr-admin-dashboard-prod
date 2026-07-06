import type { ReactNode } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { getLocalStorage } from "../lib/global/localStorageHelper";
import { AppConstant } from "../lib/global/AppConstant";
import {
  getDefaultAuthorizedPath,
  isAuthenticatedPathAllowed,
  parseAllowedMenuKeys,
} from "../lib/routes/roleAccess";
import { routes, ROUTES } from "./Routes";

function ProtectedRouteElement({
  route,
  isAuthenticated,
  children,
}: {
  route: (typeof routes)[0];
  isAuthenticated: boolean;
  children: ReactNode;
}) {
  const location = useLocation();
  if (!route.isProtected) {
    return <>{children}</>;
  }
  if (!isAuthenticated) {
    return (
      <Navigate
        to={ROUTES.LOGIN.path}
        replace
        state={{ from: location.pathname }}
      />
    );
  }
  const role = getLocalStorage(AppConstant.userRole);
  const allowedMenuKeys = parseAllowedMenuKeys(
    getLocalStorage(AppConstant.userAccessibleMenuKeys)
  );
  if (!isAuthenticatedPathAllowed(location.pathname, role, allowedMenuKeys)) {
    return (
      <Navigate to={getDefaultAuthorizedPath(role, allowedMenuKeys)} replace />
    );
  }
  return <>{children}</>;
}

const AppRoutes = ({ isAuthenticated }: { isAuthenticated: boolean }) => {
  return (
    <Routes>
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Navigate
              to={getDefaultAuthorizedPath(
                getLocalStorage(AppConstant.userRole),
                parseAllowedMenuKeys(
                  getLocalStorage(AppConstant.userAccessibleMenuKeys)
                )
              )}
              replace
            />
          ) : (
            <Navigate to={ROUTES.LOGIN.path} replace />
          )
        }
      />

      {routes.map((route, idx) => (
        <Route
          key={idx}
          path={route.path}
          element={
            <ProtectedRouteElement
              route={route}
              isAuthenticated={isAuthenticated}
            >
              {route.element as ReactNode}
            </ProtectedRouteElement>
          }
        />
      ))}

      <Route
        path="*"
        element={<Navigate to={ROUTES.ERROR404.path} replace />}
      />
    </Routes>
  );
};

export default AppRoutes;
