import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import "./index.css";
import { Layout } from "@/components/Layout";
import { RequireAuth } from "@/components/RequireAuth";
import DevLogin from "@/pages/dev/login";
import ObjectsIndex from "@/pages/objects/index";
import ObjectsShow from "@/pages/objects/show";
import WebhooksIndex from "@/pages/webhooks/index";
import WhoamiShow from "@/pages/whoami/show";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function App() {
  return (
    <Routes>
      <Route
        path="/dev/login"
        element={
          <Layout me={null}>
            <DevLogin />
          </Layout>
        }
      />
      <Route
        path="*"
        element={
          <RequireAuth>
            {(me) => (
              <Layout me={me}>
                <Routes>
                  <Route
                    path="/"
                    element={<Navigate to="/objects" replace />}
                  />
                  <Route path="/objects" element={<ObjectsIndex me={me} />} />
                  <Route path="/objects/*" element={<ObjectsShow />} />
                  <Route path="/whoami" element={<WhoamiShow me={me} />} />
                  <Route
                    path="/webhooks"
                    element={
                      me.identity.role === "admin" ? (
                        <WebhooksIndex />
                      ) : (
                        <Navigate to="/objects" replace />
                      )
                    }
                  />
                  <Route
                    path="*"
                    element={
                      <p className="text-sm text-gray-500">
                        ページが見つかりません
                      </p>
                    }
                  />
                </Routes>
              </Layout>
            )}
          </RequireAuth>
        }
      />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
