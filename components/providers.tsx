"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { NavigationFeedback } from "@/components/navigation-feedback";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        <NavigationFeedback />
      </Suspense>
      {children}
    </QueryClientProvider>
  );
}
