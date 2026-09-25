import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "./app/router";
import { QueryProvider } from "./app/providers/query-provider";

function App() {
  return (
    <QueryProvider>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </QueryProvider>
  );
}

export default App;