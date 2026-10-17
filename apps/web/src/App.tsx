import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "./app/router";
import { QueryProvider } from "./app/providers/query-provider";
import { AuthProvider } from "./app/providers/auth-provider";

function App() {
  return (
    <QueryProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </BrowserRouter>
    </QueryProvider>
  );
}

export default App;
