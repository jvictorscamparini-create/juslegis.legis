"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((m: string) => {
    setMessage(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 3400);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <ToastContext.Provider value={say}>
      {children}
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/** Mensagem padrão dos módulos ainda não desenhados (mesmo texto dos protótipos). */
export function soonMessage(name: string) {
  return `“${name}” será desenhada em uma próxima etapa.`;
}
