"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InsightsViewerProps {
  fileId: string;
  fileDetails: any;
  onInsightsGenerated?: () => void;
  onGeneratingChange?: (isGenerating: boolean) => void;
  triggerGeneration?: boolean;
}

export function InsightsViewer({ fileId, fileDetails, onInsightsGenerated, onGeneratingChange, triggerGeneration }: InsightsViewerProps) {
  const [hasInsights, setHasInsights] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [insightsHTML, setInsightsHTML] = useState<string>("");
  const { toast } = useToast();

  // Check if insights exist
  useEffect(() => {
    const checkInsights = async () => {
      if (!fileId || !fileDetails) {
        setIsLoading(false);
        return;
      }

      try {
        if (fileDetails.insights && fileDetails.insights.trim() !== '') {
          setHasInsights(true);
          setInsightsHTML(fileDetails.insights);
          setIsLoading(false);
          return;
        }
        
        const normalizedFileId = Array.isArray(fileId) ? fileId[0] : fileId;
        const response = await fetch(`/api/generate-insights-document?fileId=${normalizedFileId}&format=json`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.document) {
            setHasInsights(true);
            setInsightsHTML(data.document);
          } else {
            setHasInsights(false);
          }
        } else {
          setHasInsights(false);
        }
      } catch (error) {
        setHasInsights(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkInsights();
  }, [fileId, fileDetails]);

  // Trigger generation when triggerGeneration prop changes to true
  useEffect(() => {
    if (triggerGeneration && !hasInsights && !isGenerating && !isLoading) {
      generateInsights();
    }
  }, [triggerGeneration, hasInsights, isGenerating, isLoading]);

  const generateInsights = async () => {
    if (!fileId) {
      toast({
        title: "Error",
        description: "File ID not found",
        variant: "destructive"
      });
      return;
    }

    if (!isGenerating) {
      setIsGenerating(true);
      if (onGeneratingChange) {
        onGeneratingChange(true);
      }
    }

    try {
      const normalizedFileId = Array.isArray(fileId) ? fileId[0] : fileId;
      
      const response = await fetch('/api/generate-insights-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId: normalizedFileId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate insights document");
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Failed to generate insights document");
      }
      
      const fetchResponse = await fetch(`/api/generate-insights-document?fileId=${normalizedFileId}&format=json`);
      
      if (!fetchResponse.ok) {
        throw new Error("Failed to fetch generated insights");
      }

      const fetchData = await fetchResponse.json();
      
      if (fetchData.success && fetchData.document) {
        setHasInsights(true);
        setInsightsHTML(fetchData.document);
        toast({
          title: "Success",
          description: "Insights document generated successfully!",
        });
        if (onInsightsGenerated) {
          onInsightsGenerated();
        }
      } else {
        throw new Error("Failed to retrieve generated insights");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate insights document",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
      if (onGeneratingChange) {
        onGeneratingChange(false);
      }
    }
  };

  const handleDownload = () => {
    if (!insightsHTML) {
      toast({
        title: "Error",
        description: "No insights document available",
        variant: "destructive"
      });
      return;
    }

    try {
      const fileName = getFileName();
      
      // Create a new window with the HTML content
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast({
          title: "Error",
          description: "Please allow popups to download the PDF",
          variant: "destructive"
        });
        return;
      }

      // Set the document title to suggest the filename
      const htmlWithTitle = insightsHTML.replace(
        /<title>.*?<\/title>/i,
        `<title>${fileName}-insights</title>`
      );
      
      if (!htmlWithTitle.includes('<title>')) {
        const modifiedHTML = htmlWithTitle.replace(
          /<head>/i,
          `<head><title>${fileName}-insights</title>`
        );
        printWindow.document.write(modifiedHTML);
      } else {
        printWindow.document.write(htmlWithTitle);
      }
      
      printWindow.document.close();
      
      // Wait for content to load, then trigger print
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 250);
      };

      toast({
        title: "Download",
        description: "Use your browser's print dialog to save as PDF",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to download insights document",
        variant: "destructive"
      });
    }
  };

  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsGenerating(true);
    if (onGeneratingChange) {
      onGeneratingChange(true);
    }
    generateInsights();
  };

  const getFileName = () => {
    const fileName = fileDetails?.name || fileDetails?.file_name || 'document';
    return fileName.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9]/gi, '_');
  };

  return (
    <div className="space-y-4" data-testid="insights-viewer">
      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking for insights...
        </div>
      ) : !hasInsights ? (
        <Button
          onClick={handleButtonClick}
          disabled={isGenerating}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          variant="default"
          type="button"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating Insights...
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              Generate Insights
            </>
          )}
        </Button>
      ) : (
        <Button
          onClick={handleDownload}
          className="flex items-center gap-2"
          variant="default"
        >
          <Download className="h-4 w-4" />
          Download Document
        </Button>
      )}
    </div>
  );
}
