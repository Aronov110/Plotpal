import { lazy, type ReactElement, Suspense } from "react";
import { Route, Routes } from "react-router";
import { LoadingState } from "./components/molecules/LoadingState/LoadingState.tsx";
import { AppHomePage } from "./components/pages/AppHomePage/AppHomePage.tsx";
import { HomePage } from "./components/pages/HomePage/HomePage.tsx";
import { LoginPage } from "./components/pages/LoginPage/LoginPage.tsx";
import { NotFoundPage } from "./components/pages/NotFoundPage/NotFoundPage.tsx";
import { RegisterPage } from "./components/pages/RegisterPage/RegisterPage.tsx";
import { AppLayout } from "./components/templates/AppLayout/AppLayout.tsx";
import { RedirectIfSignedIn } from "./components/templates/RedirectIfSignedIn/RedirectIfSignedIn.tsx";
import { RequireAuth } from "./components/templates/RequireAuth/RequireAuth.tsx";
import { RouteErrorBoundary } from "./components/templates/RouteErrorBoundary/RouteErrorBoundary.tsx";

// The writing screen is the biggest one and only a signed-in person with a project needs it, so its
// code is fetched when the screen is first opened, not with the landing and login pages.
const WritingPage = lazy(() =>
  import("./components/pages/WritingPage/WritingPage.tsx").then((module) => ({
    default: module.WritingPage,
  })),
);

/**
 * What shows while the writing screen's code is on its way: the frame of the app and a loading
 * status, and no heading. The screen brings its own, and `RouteFocus` waits for it.
 */
function WritingPageLoading(): ReactElement {
  return (
    <AppLayout wide>
      <LoadingState label="Opening your project…" shape="paper" />
    </AppLayout>
  );
}

/**
 * The screens of the app and the addresses they live at. `/auth` and everything below it belong to
 * the API (the dev server and the production proxy send them there), so no screen may use that
 * address.
 */
export function AppRoutes(): ReactElement {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route element={<RedirectIfSignedIn />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/app" element={<AppHomePage />} />
        <Route
          path="/app/projects/:projectId"
          element={
            <RouteErrorBoundary>
              <Suspense fallback={<WritingPageLoading />}>
                <WritingPage />
              </Suspense>
            </RouteErrorBoundary>
          }
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
