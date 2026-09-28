import { useNavigate } from "react-router-dom";

export function useSmartBack(fallbackPath: string) {
  const navigate = useNavigate();

  return () => {
    const historyIndex = window.history.state?.idx;
    if (typeof historyIndex === "number" && historyIndex > 0) {
      navigate(-1);
      return;
    }

    navigate(fallbackPath, { replace: true });
  };
}
