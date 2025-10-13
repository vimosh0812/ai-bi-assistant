"use client";

import { useEffect, useRef, useState } from "react";

interface TableauVizProps {
  src: string;
  hideTabs?: boolean;
  hideToolbar?: boolean;
  [key: string]: any;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "tableau-viz": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string;
        width?: string | number;
        height?: string | number;
        "hide-tabs"?: boolean;
        "hide-toolbar"?: boolean;
        [key: string]: any;
      };
    }
  }
}

export default function TableauViz({
  src,
  hideTabs = true,
  hideToolbar = true,
  ...props
}: TableauVizProps) {
  const vizRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTableauReady, setIsTableauReady] = useState(false);

  useEffect(() => {
    // Check if Tableau script is already loaded
    const existingScript = document.getElementById("tableauScript");
    if (existingScript) {
      setIsTableauReady(true);
      setIsLoading(false);
      return;
    }

    // Load Tableau API
    const script = document.createElement("script");
    script.id = "tableauScript";
    script.type = "module";
    script.src =
      "https://prod-in-a.online.tableau.com/javascripts/api/tableau.embedding.3.latest.min.js";
    
    script.onload = () => {
      console.log("Tableau API loaded successfully");
      setIsTableauReady(true);
      setIsLoading(false);
      // Dispatch a custom event to notify components that Tableau is ready
      window.dispatchEvent(new CustomEvent('tableauReady'));
    };
    
    script.onerror = (error) => {
      console.error("Failed to load Tableau API:", error);
      setError("Failed to load Tableau visualization. Please check your internet connection and try again.");
      setIsLoading(false);
      // Dispatch an error event
      window.dispatchEvent(new CustomEvent('tableauError', { detail: error }));
    };
    
    document.head.appendChild(script);

    // Listen for Tableau ready event
    const handleTableauReady = () => {
      setIsTableauReady(true);
      setIsLoading(false);
    };

    const handleTableauError = () => {
      setError("Tableau visualization failed to load");
      setIsLoading(false);
    };

    window.addEventListener('tableauReady', handleTableauReady);
    window.addEventListener('tableauError', handleTableauError);

    return () => {
      window.removeEventListener('tableauReady', handleTableauReady);
      window.removeEventListener('tableauError', handleTableauError);
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-red-50 border border-red-200 rounded-lg">
        <div className="text-center p-4">
          <p className="text-red-600 font-medium">Visualization Error</p>
          <p className="text-red-500 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 border border-gray-200 rounded-lg">
        <div className="text-center p-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Loading visualization...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <tableau-viz
        src={src}
        width="100%"
        height="100%"
        hide-tabs={hideTabs}
        hide-toolbar={hideToolbar}
        style={{ width: "100%", height: "100%" }}
        {...props}
      />
    </div>
  );
}
