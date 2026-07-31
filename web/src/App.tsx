import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthContext";
import { RequireSession } from "./auth/RequireSession";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RequireSession>
          <h1>Dashboard</h1>
        </RequireSession>
      </AuthProvider>
    </QueryClientProvider>
  );
}
