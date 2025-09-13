"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function SuccessPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading (optional)
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const handleRedirect = () => {
    router.push("/dashboard/payments"); // redirect to Payments dashboard
  };

  return (
    <div className="max-w-lg mx-auto mt-10">
      <Card>
        <CardHeader>
          <CardTitle>Subscription Successful</CardTitle>
          <CardDescription>
            {loading ? "Processing..." : "Your subscription is now active!"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {loading ? (
            <Loader2 className="animate-spin h-6 w-6" />
          ) : (
            <svg
              className="h-16 w-16 text-green-500"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
              <path
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12l2 2 4-4"
              />
            </svg>
          )}
          {!loading && (
            <Button className="w-full mt-2" onClick={handleRedirect}>
              Go to Payments
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
