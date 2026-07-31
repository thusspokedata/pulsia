import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router";
import { AuthProvider } from "./auth/AuthContext";
import { RequireSession } from "./auth/RequireSession";
import { DateRangeProvider } from "./dashboard/DateRangeContext";
import { AppLayout } from "./layout/AppLayout";
import { DashboardPage } from "./dashboard/DashboardPage";
import { UploadPage } from "./upload/UploadPage";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RequireSession>
          <DateRangeProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="subir" element={<UploadPage />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </DateRangeProvider>
        </RequireSession>
      </AuthProvider>
    </QueryClientProvider>
  );
}
