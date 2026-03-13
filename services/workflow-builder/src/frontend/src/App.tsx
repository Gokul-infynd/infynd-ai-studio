import "@xyflow/react/dist/style.css";
import { Suspense, useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { LoadingPage } from "./pages/LoadingPage";
import router from "./routes";
import { useDarkStore } from "./stores/darkStore";

export default function App() {
  const dark = useDarkStore((state) => state.dark);
  const setDark = useDarkStore((state) => state.setDark);

  useEffect(() => {
    if (!dark) {
      document.getElementById("body")!.classList.remove("dark");
    } else {
      document.getElementById("body")!.classList.add("dark");
    }
  }, [dark]);

  // Sync theme with parent via localStorage 'isDark' key
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "isDark" && e.newValue !== null) {
        setDark(e.newValue === "true");
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Also check on mount in case it changed before loading
    const storedIsDark = localStorage.getItem("isDark");
    if (storedIsDark !== null) {
      const isDark = storedIsDark === "true";
      if (isDark !== dark) {
        setDark(isDark);
      }
    }

    return () => window.removeEventListener("storage", handleStorageChange);
  }, [setDark, dark]);

  return (
    <Suspense fallback={<LoadingPage />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
