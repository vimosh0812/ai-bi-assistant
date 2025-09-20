"use client";

import { useEffect, useRef } from "react";

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

  useEffect(() => {
    // Load Tableau API once
    if (!document.getElementById("tableauScript")) {
      const script = document.createElement("script");
      script.id = "tableauScript";
      script.type = "module";
      script.src =
        "https://public.tableau.com/javascripts/api/tableau.embedding.3.latest.js";
      script.onload = () => console.log("Tableau API loaded");
      script.onerror = () => console.error("Failed to load Tableau API");
      document.body.appendChild(script);
    }
  }, []);

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
