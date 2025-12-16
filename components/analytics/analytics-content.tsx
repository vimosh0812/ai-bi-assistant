"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { DEFAULT_NAMES } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import TableauViz from "@/components/tableauviz";
import { ArrowLeft, Edit3, Eye, EyeOff, BarChart3, TrendingUp, Home, Bot, Copy, Check, Download, FileText, Loader2 } from "lucide-react";
import { OpenAIKPIAnalysis } from "@/types/kpi";
import { KPIChart } from "@/components/kpi-chart";
import { CSVChatbot } from "@/components/csv-chatbot";
import { InsightsViewer } from "@/components/insights/insights-viewer";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { BarGraphLoader } from "@/components/ui/bar-graph-loader";

interface PublishResponse {
  success: boolean;
  message: string;
  data?: {
    workbook: {
      id: string;
      name: string;
      contentUrl: string;
      webpageUrl: string;
      sheetUrl?: string;
      showTabs: boolean;
      size: number;
      createdAt: string;
      updatedAt: string;
      encryptExtracts: boolean;
    };
  };
}

export default function FileAnalyticsPage() {
  const { folderId, fileId } = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [csvData, setCsvData] = useState<any[]>([]);
  const [fileDetails, setFileDetails] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [publishType, setPublishType] = useState<"workbook" | "datasource">("workbook");
  const [isUploading, setIsUploading] = useState(false);
  const [response, setResponse] = useState<PublishResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [kpiAnalysis, setKpiAnalysis] = useState<OpenAIKPIAnalysis | null>(null);
  const [isGeneratingKPI, setIsGeneratingKPI] = useState(false);
  const [hasKpiAnalysis, setHasKpiAnalysis] = useState(false);
  const [showKpiView, setShowKpiView] = useState(false);
  const [folderName, setFolderName] = useState<string>("");
  const [deletingMetricIndex, setDeletingMetricIndex] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showPowerBIDialog, setShowPowerBIDialog] = useState(false);
  const [powerBIUrl, setPowerBIUrl] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [showInsightsView, setShowInsightsView] = useState(false);
  const [hasInsights, setHasInsights] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [isDownloadingInsights, setIsDownloadingInsights] = useState(false);
  const [triggerInsightsGeneration, setTriggerInsightsGeneration] = useState(false);
  const { toast } = useToast();

  // Fetch file details and CSV content
  useEffect(() => {
    // Normalize params (Next.js can return arrays for dynamic routes)
    const normalizedFileId = Array.isArray(fileId) ? fileId[0] : fileId;
    const normalizedFolderId = Array.isArray(folderId) ? folderId[0] : folderId;

    // Reset state when params change
    setIsLoading(true);
    setCsvData([]);
    setFileDetails(null);
    setFile(null);
    setResponse(null);
    setError(null);
    setKpiAnalysis(null);
    setHasKpiAnalysis(false);
    setShowKpiView(false);
    setFolderName("");

    if (!normalizedFileId || !normalizedFolderId) {
      setIsLoading(false);
      return;
    }

    const fetchFile = async () => {
      try {
        const { data, error } = await supabase
          .from("files")
          .select("*")
          .eq("id", normalizedFileId)
          .single();

        if (error) {
          console.error("Error fetching file:", error);
          setError("Failed to load file details");
          setIsLoading(false);
          return;
        }

        setFileDetails(data);
        setHasKpiAnalysis(data.has_kpi_analysis || false);
        setHasInsights(data.insights && data.insights.trim() !== '');

        // Fetch folder name for breadcrumb
        const { data: folderData, error: folderError } = await supabase
          .from("folders")
          .select("name")
          .eq("id", normalizedFolderId)
          .single();

        if (!folderError && folderData) {
          setFolderName(folderData.name);
        }

        if (data.connected_to_tableau && data.embed_url) {
          setResponse({
            success: true,
            message: "Already connected",
            data: {
              workbook: {
                id: data.tableau_workbook_id,
                name: data.file_name,
                contentUrl: "",
                webpageUrl: "",
                sheetUrl: data.embed_url,
                showTabs: true,
                size: 0,
                createdAt: "",
                updatedAt: "",
                encryptExtracts: false,
              },
            },
          });
          setIsLoading(false);
        } else {
          await fetchCsv(data.storage_path);
        }

        // Check if KPI analysis exists
        if (data.has_kpi_analysis) {
          await fetchKpiAnalysis();
        }
      } catch (error) {
        console.error("Error in fetchFile:", error);
        setError("Failed to load file");
        setIsLoading(false);
      }
    };

    const fetchCsv = async (path: string) => {
      try {
        const { data, error } = await supabase.storage.from("csv-files").download(path);
        if (error) {
          console.error("Error downloading CSV:", error);
          setError("Failed to load CSV data");
          setIsLoading(false);
          return;
        }

        const text = await data.text();
        const parsed = Papa.parse(text, { header: true });
        setCsvData(parsed.data);
        const filename = path.split("/").pop() || "data.csv";
        setFile(new File([text], filename, { type: "csv" }));
        setPublishType("datasource");
        setIsLoading(false);
      } catch (error) {
        console.error("Error parsing CSV:", error);
        setError("Failed to parse CSV data");
        setIsLoading(false);
      }
    };

    const fetchKpiAnalysis = async () => {
      try {
        const response = await fetch(`/api/get-kpi-analysis?fileId=${normalizedFileId}`);
        const data = await response.json();
        
        if (data.success && data.kpiAnalysis) {
          setKpiAnalysis(data.kpiAnalysis);
        }
      } catch (error) {
        console.error("Error fetching KPI analysis:", error);
      }
    };

    fetchFile();
  }, [fileId, folderId, supabase]);

  const handleConnectPowerBI = async () => {
    if (!fileDetails?.storage_path) return;
    
    try {
      const { data, error } = await supabase
        .storage
        .from("csv-files")
        .createSignedUrl(fileDetails.storage_path, 60 * 60 * 24 * 7); // 7 days

      if (error) throw error;
      
      if (data?.signedUrl) {
        setPowerBIUrl(data.signedUrl);
        setShowPowerBIDialog(true);
      }
    } catch (err) {
      console.error("Error generating Power BI URL:", err);
      toast({
        title: "Error",
        description: "Failed to generate Power BI connection URL",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(powerBIUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    toast({
      title: "Copied",
      description: "Power BI URL copied to clipboard",
    });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!file) {
      setError("CSV file is missing");
      return;
    }

    setIsUploading(true);
    setError(null);
    setResponse(null);

    try {
        console.log("Publishing as:", publishType);
      const formData = new FormData();
      formData.append("file", file);
    console.log("File type:", file.type);

      let endpoint = "";
      if (publishType === "workbook") {
        formData.append("workbookName", DEFAULT_NAMES.WORKBOOK_NAME);
        formData.append("showTabs", "true");
        formData.append("overwrite", "false");
        formData.append("encryptExtracts", "false");
        endpoint = "/api/publish-workbook";
      } else {
        formData.append("datasourceName", DEFAULT_NAMES.DATA_SOURCE_NAME);
        formData.append("overwrite", "false");
        formData.append("encryptExtracts", "false");
        endpoint = "/api/publish-datasource";
      }

      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to publish ${publishType}`);

      const embedUrl = data.data?.workbook?.sheetUrl;
      await supabase
        .from("files")
        .update({
          tableau_workbook_id: data.data?.workbook?.id,
          embed_url: embedUrl,
          connected_to_tableau: true,
        })
        .eq("id", fileDetails.id);

      setResponse(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const generateKpiAnalysis = async () => {
    if (!csvData.length || !fileDetails) return;
    
    setIsGeneratingKPI(true);
    setError(null);
    
    try {
      // Validate data before sending
      if (!csvData || csvData.length === 0) {
        throw new Error("No CSV data available");
      }
      
      if (!csvData[0] || Object.keys(csvData[0]).length === 0) {
        throw new Error("CSV data has no headers");
      }

      // Generate KPI analysis
      console.log("🤖 [AI REQUEST] Generating KPI analysis...", {
        headers: Object.keys(csvData[0] || {}),
        rowCount: csvData.length,
        fileId: fileDetails.id
      });
      
      const response = await fetch("/api/generate-kpi-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          headers: Object.keys(csvData[0] || {}), 
          rows: csvData,
          fileId: fileDetails.id
        }),
      });
      
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error("❌ [AI RESPONSE] Failed to parse JSON:", parseError);
        throw new Error(`Failed to parse server response: ${response.status} ${response.statusText}`);
      }
      
      // Log full AI response for debugging
      console.log("🤖 [AI RESPONSE] Full KPI Analysis Response:", {
        status: response.status,
        ok: response.ok,
        data: data,
        metricsCount: data?.metrics?.length || 0,
        metrics: data?.metrics?.map((m: any) => ({
          name: m.name,
          chartType: m.chartType,
          category: m.category,
          sqlQuery: m.sqlQuery,
          xAxisQuery: m.xAxisQuery
        })) || []
      });
      
      if (!response.ok) {
        console.error("❌ [AI RESPONSE] Server error:", {
          status: response.status,
          error: data?.error
        });
        throw new Error(data?.error || `Server error: ${response.status}`);
      }
      
      if (data.error) {
        console.error("❌ [AI RESPONSE] Error in response:", data.error);
        throw new Error(data.error);
      }
      
      if (!data || !data.metrics || !Array.isArray(data.metrics)) {
        console.error("❌ [AI RESPONSE] Invalid response format:", data);
        throw new Error("Invalid KPI analysis response format");
      }
      
      console.log("✅ [AI RESPONSE] Successfully received KPI analysis with", data.metrics.length, "metrics");
      setKpiAnalysis(data);
      
      // Store the KPI analysis
      try {
        console.log("💾 [KPI EXECUTION] Storing KPI analysis and executing queries...", {
          fileId: fileDetails.id,
          metricsCount: data.metrics.length
        });
        
        const storeResponse = await fetch("/api/store-kpi-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            fileId: fileDetails.id,
            kpiAnalysis: data
          }),
        });
        
        let storeData;
        try {
          storeData = await storeResponse.json();
        } catch (parseError) {
          console.error("❌ [KPI EXECUTION] Failed to parse store response:", parseError);
          throw parseError;
        }
        
        // Log full execution response for debugging
        console.log("💾 [KPI EXECUTION] Full Store/Execution Response:", {
          status: storeResponse.status,
          ok: storeResponse.ok,
          success: storeData?.success,
          kpiAnalysisId: storeData?.kpiAnalysisId,
          message: storeData?.message,
          error: storeData?.error,
          fullResponse: storeData
        });
        
        if (storeResponse.ok) {
          if (storeData.success) {
            console.log("✅ [KPI EXECUTION] Successfully stored and executed KPI analysis:", {
              kpiAnalysisId: storeData.kpiAnalysisId,
              metricsCount: data.metrics.length
            });
            setHasKpiAnalysis(true);
            // Update file details
            setFileDetails((prev: any) => ({
              ...prev,
              has_kpi_analysis: true,
              kpi_analysis_id: storeData.kpiAnalysisId
            }));
          } else {
            console.warn("⚠️ [KPI EXECUTION] Store response indicates failure:", storeData);
          }
        } else {
          console.error("❌ [KPI EXECUTION] Failed to store KPI analysis:", {
            status: storeResponse.status,
            statusText: storeResponse.statusText,
            error: storeData?.error,
            fullResponse: storeData
          });
        }
      } catch (storeError) {
        console.error("❌ [KPI EXECUTION] Error storing KPI analysis:", storeError);
        // Don't throw - KPI was generated successfully, just storage failed
      }
      
    } catch (err: any) {
      console.error("KPI generation error:", err);
      const errorMessage = err?.message || err?.toString() || "Failed to generate KPI analysis. Please try again.";
      setError(errorMessage);
    } finally {
      setIsGeneratingKPI(false);
    }
  };

  const viewKpiAnalytics = () => {
    console.log("viewKpiAnalytics called", { currentShowKpiView: showKpiView, hasKpiAnalysis, responseSuccess: response?.success });
    setShowKpiView(!showKpiView);
    if (showInsightsView) setShowInsightsView(false); // Hide insights when showing KPI
  };

  const generateAnnexSection = async (kpiAnalysis: OpenAIKPIAnalysis, fileDetails: any): Promise<string> => {
    try {
      const normalizedFileId = Array.isArray(fileId) ? fileId[0] : fileId;
      
      // Get execution results for all metrics
      const { data: executionResults } = await supabase
        .from("kpi_execution_results")
        .select("*")
        .eq("kpi_analysis_id", fileDetails.kpi_analysis_id)
        .eq("execution_success", true)
        .order("metric_index");
      
      const resultsMap = new Map<number, any>();
      (executionResults || []).forEach((result: any) => {
        resultsMap.set(result.metric_index, result);
      });
      
      let annexHTML = `
        <div style="page-break-before: always; margin-top: 40px;">
          <h1 style="font-size: 24pt; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">Annex: KPI Metrics Reference</h1>
          <p style="margin-bottom: 30px; color: #666;">This annex provides a reference list of all KPI metrics analyzed in the insights document.</p>
      `;
      
      kpiAnalysis.metrics.forEach((metric: any, index: number) => {
        const executionResult = resultsMap.get(index);
        const yAxisData = executionResult?.y_axis_results || [];
        
        annexHTML += `
          <div style="page-break-inside: avoid; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
            <h2 style="font-size: 18pt; margin-bottom: 10px; color: #333;">${metric.name}</h2>
            <p style="margin-bottom: 15px; color: #666;">${metric.description}</p>
        `;
        
        // Add data table only if it has 20 rows or less
        if (yAxisData && yAxisData.length > 0 && typeof yAxisData[0] === 'object' && yAxisData.length <= 20) {
          annexHTML += `
            <h3 style="font-size: 14pt; margin-top: 20px; margin-bottom: 15px; color: #333;">Data Table</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 10pt;">
              <thead>
                <tr style="background-color: #f2f2f2;">
                  ${Object.keys(yAxisData[0]).map((key: string) => `<th style="border: 1px solid #ddd; padding: 8px; text-align: left;">${key}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${yAxisData.map((row: any) => `
                  <tr>
                    ${Object.values(row).map((val: any) => `<td style="border: 1px solid #ddd; padding: 8px;">${typeof val === 'number' ? val.toLocaleString() : String(val)}</td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
        }
        
        annexHTML += `</div>`;
      });
      
      annexHTML += `</div>`;
      return annexHTML;
    } catch (error) {
      console.error("Error generating annex:", error);
      return '';
    }
  };


  const handleDownloadInsights = async () => {
    if (!fileDetails?.insights || fileDetails.insights.trim() === '') {
      toast({
        title: "Error",
        description: "No insights document available",
        variant: "destructive"
      });
      return;
    }

    setIsDownloadingInsights(true);

    try {
      const fileName = (fileDetails?.name || fileDetails?.file_name || 'document')
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-z0-9]/gi, '_');
      
      let insightsHTML = fileDetails.insights;
      
      // Add Annex section with all KPI charts and tables if available
      if (kpiAnalysis && kpiAnalysis.metrics && kpiAnalysis.metrics.length > 0) {
        const annexHTML = await generateAnnexSection(kpiAnalysis, fileDetails);
        insightsHTML = insightsHTML.replace('</body>', `${annexHTML}</body>`);
      }
      
      // Create a completely isolated iframe to prevent style interference
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '-9999px';
      iframe.style.width = '210mm';
      iframe.style.height = '297mm';
      iframe.style.border = 'none';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);
      
      // Wait for iframe to be ready - improved loading
      await new Promise<void>((resolve) => {
        const checkIframe = () => {
          if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
            resolve();
          } else {
            iframe.onload = () => resolve();
            iframe.src = 'about:blank';
            // Fallback timeout
            setTimeout(() => resolve(), 500);
          }
        };
        checkIframe();
      });
      
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        throw new Error('Failed to access iframe document');
      }
      
      // Add A4 styling with proper margins, padding, and page breaks
      const styledHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            @page {
              size: A4;
              margin: 0;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              width: 210mm;
              margin: 0;
              padding: 25mm 15mm 20mm 15mm;
              font-family: Arial, sans-serif;
              font-size: 12pt;
              line-height: 1.6;
              color: #000;
              background: #fff;
            }
            .content-wrapper {
              width: 100%;
            }
            h1 {
              font-size: 24pt;
              margin-top: 0;
              margin-bottom: 0.5em;
              color: #000;
              page-break-after: avoid;
            }
            h2 {
              font-size: 20pt;
              margin-top: 1.5em;
              margin-bottom: 0.5em;
              color: #000;
              page-break-after: avoid;
            }
            h3 {
              font-size: 16pt;
              margin-top: 1em;
              margin-bottom: 0.5em;
              color: #000;
              page-break-after: avoid;
            }
            h4, h5, h6 {
              margin-top: 1em;
              margin-bottom: 0.5em;
              color: #000;
              page-break-after: avoid;
            }
            p {
              margin-bottom: 1em;
              color: #000;
              orphans: 3;
              widows: 3;
            }
            ul, ol {
              margin-bottom: 1em;
              padding-left: 2em;
            }
            li {
              margin-bottom: 0.5em;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 1em 0;
              page-break-inside: auto;
            }
            thead {
              display: table-header-group;
            }
            tfoot {
              display: table-footer-group;
            }
            tr {
              page-break-inside: avoid;
              page-break-after: auto;
            }
            /* Prevent breaking inside important elements */
            h1, h2, h3, h4, h5, h6 {
              page-break-after: avoid;
              page-break-inside: avoid;
            }
            /* Allow breaking between paragraphs and sections */
            p, div, section {
              orphans: 3;
              widows: 3;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
              color: #000;
            }
            th {
              background-color: #f2f2f2;
            }
            img {
              max-width: 100%;
              height: auto;
              display: block;
              margin: 1em 0;
              page-break-inside: avoid;
            }
            .page-break {
              page-break-before: always;
            }
            .no-break {
              page-break-inside: avoid;
            }
            @media print {
              body {
                padding: 25mm 15mm 20mm 15mm;
              }
            }
          </style>
        </head>
        <body>
          <div class="content-wrapper">
            ${insightsHTML.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')}
          </div>
        </body>
        </html>
      `;
      
      iframeDoc.open();
      iframeDoc.write(styledHTML);
      iframeDoc.close();
      
      // Wait for iframe content to fully render
      await new Promise((resolve) => {
        const checkReady = () => {
          if (iframeDoc.readyState === 'complete' && iframeDoc.body) {
            // Wait for fonts and styles to load, and ensure layout is complete
            iframeDoc.defaultView?.requestAnimationFrame(() => {
              iframeDoc.defaultView?.requestAnimationFrame(() => {
                setTimeout(resolve, 1500);
              });
            });
          } else {
            setTimeout(checkReady, 100);
          }
        };
        // Start checking after a short delay
        setTimeout(checkReady, 100);
      });
      
      // Wait for images to load
      const images = iframeDoc.querySelectorAll('img');
      const imagePromises = Array.from(images).map((img: HTMLImageElement) => {
        return new Promise((resolve) => {
          if (img.complete && img.naturalHeight !== 0) {
            resolve(null);
          } else {
            img.onload = () => resolve(null);
            img.onerror = () => resolve(null);
            // Timeout after 5 seconds
            setTimeout(() => resolve(null), 5000);
          }
        });
      });
      
      await Promise.all(imagePromises);
      
      // Additional wait to ensure everything is rendered
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      // Use html2canvas and jsPDF to generate PDF
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      
      const bodyElement = iframeDoc.body;
      if (!bodyElement) {
        throw new Error('Body element not found');
      }
      
      // Get the actual content dimensions
      const contentWidth = bodyElement.scrollWidth;
      const contentHeight = bodyElement.scrollHeight;
      
      const canvas = await html2canvas(bodyElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        width: contentWidth,
        height: contentHeight,
        backgroundColor: '#ffffff',
        windowWidth: contentWidth,
        windowHeight: contentHeight,
      });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // A4 dimensions in mm with proper margins
      const pageWidth = 210;
      const pageHeight = 297;
      const topMargin = 25; // Top margin in mm
      const bottomMargin = 20; // Bottom margin in mm (includes footer space)
      const sideMargin = 15; // Side margins in mm
      
      // Calculate dimensions
      const pdfContentWidth = pageWidth - (sideMargin * 2);
      const pdfContentHeight = pageHeight - topMargin - bottomMargin;
      
      // Convert canvas pixels to mm
      const canvasWidthPx = canvas.width;
      const canvasHeightPx = canvas.height;
      
      // Calculate the width and height in mm for the PDF
      const imgWidthMm = pdfContentWidth;
      const imgHeightMm = (canvasHeightPx * pdfContentWidth) / canvasWidthPx;
      
      // Calculate how many pages we need
      const totalPages = Math.ceil(imgHeightMm / pdfContentHeight);
      
      // Add pages with proper positioning and margins
      for (let i = 0; i < totalPages; i++) {
        if (i > 0) {
          pdf.addPage();
        }
        
        // Calculate the source Y position in pixels
        const sourceYPx = (i * pdfContentHeight * canvasWidthPx) / pdfContentWidth;
        const maxSourceHeightPx = canvasHeightPx - sourceYPx;
        const desiredSourceHeightPx = (pdfContentHeight * canvasWidthPx) / pdfContentWidth;
        const sourceHeightPx = Math.min(desiredSourceHeightPx, maxSourceHeightPx);
        
        // Create a temporary canvas for this page
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvasWidthPx;
        pageCanvas.height = Math.ceil(sourceHeightPx);
        const pageCtx = pageCanvas.getContext('2d');
        
        if (pageCtx && sourceHeightPx > 0) {
          // Clear canvas with white background
          pageCtx.fillStyle = '#ffffff';
          pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          
          // Draw the portion of the original canvas
          pageCtx.drawImage(
            canvas,
            0, Math.floor(sourceYPx), canvasWidthPx, Math.ceil(sourceHeightPx),
            0, 0, canvasWidthPx, Math.ceil(sourceHeightPx)
          );
          
          // Compress image quality for smaller PDF size
          const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.85); // Use JPEG with 85% quality
          const pageImgHeightMm = (sourceHeightPx * pdfContentWidth) / canvasWidthPx;
          
          // Ensure we don't exceed page height
          const finalHeight = Math.min(pageImgHeightMm, pdfContentHeight);
          
          // Add image with proper margins (top and side margins)
          pdf.addImage(
            pageImgData,
            'JPEG', // Use JPEG instead of PNG for compression
            sideMargin, // Left margin
            topMargin, // Top margin
            pdfContentWidth,
            finalHeight
          );
          
          // Add page number in footer
          const pageNumberY = pageHeight - (bottomMargin / 2);
          pdf.setFontSize(10);
          pdf.setTextColor(102, 102, 102); // Gray color
          pdf.text(
            `Page ${i + 1} of ${totalPages}`,
            pageWidth / 2, // Center horizontally
            pageNumberY,
            { align: 'center' }
          );
        }
      }
      
      // Compress PDF
      const pdfOutput = pdf.output('arraybuffer');
      const compressedPdf = new Uint8Array(pdfOutput);
      
      // Create blob and download
      const blob = new Blob([compressedPdf], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}-insights.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // Clean up iframe
      document.body.removeChild(iframe);
      
      toast({
        title: "Success",
        description: "Insights document downloaded as PDF",
      });
    } catch (error: any) {
      console.error("PDF generation error:", error);
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsDownloadingInsights(false);
    }
  };


  const handleDeleteMetric = async (metricIndex: number) => {
    setIsDeleting(true);
    setError(null);
    
    try {
      const response = await fetch("/api/delete-kpi-metric", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          fileId: fileDetails.id,
          metricIndex: metricIndex
        }),
      });
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      // Update local state by removing the metric
      if (kpiAnalysis && kpiAnalysis.metrics) {
        const updatedMetrics = [...kpiAnalysis.metrics];
        updatedMetrics.splice(metricIndex, 1);
        
        setKpiAnalysis({
          ...kpiAnalysis,
          metrics: updatedMetrics
        });
        
        // If no metrics left, hide the KPI view
        if (updatedMetrics.length === 0) {
          setShowKpiView(false);
          setHasKpiAnalysis(false);
        }
      }
      
      setDeletingMetricIndex(null);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Remove the generateEmbedCode function as we'll use the TableauViz component instead

  // Show loading state - simplified
  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <BarGraphLoader barCount={8} height={120} />
          <p className="text-gray-600 text-sm">Loading file content...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Breadcrumb Navigation */}
      <div className="mb-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink 
                href="/dashboard" 
                className="flex items-center gap-1 hover:text-foreground"
              >
                <Home className="h-4 w-4" />
                Dashboard
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink 
                href={`/dashboard/${Array.isArray(folderId) ? folderId[0] : folderId}`}
                className="hover:text-foreground"
              >
                {folderName || "Folder"}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="flex items-center gap-1">
                <span className="font-medium">{fileDetails?.file_name || "CSV File"}</span>
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {/* <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/dashboard/${Array.isArray(folderId) ? folderId[0] : folderId}`)}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Folder
          </Button> */}
          <h1 className="text-2xl font-bold">{fileDetails?.file_name || "CSV File"}</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Generate KPI Button - Hidden if already generated */}
          {!hasKpiAnalysis && (
            <Button
              onClick={generateKpiAnalysis}
              disabled={isGeneratingKPI || !csvData.length}
              className="flex items-center gap-2"
              variant="default"
            >
              <BarChart3 className="h-4 w-4" />
              {isGeneratingKPI ? "Generating..." : "Generate KPI Summary"}
            </Button>
          )}
          
          {/* View Analytics Button - Only show if analytics generated */}
          {hasKpiAnalysis && (
            <>
            <Button
              onClick={() => {
                console.log("View Analytics clicked", { showKpiView, hasKpiAnalysis, responseSuccess: response?.success });
                viewKpiAnalytics();
              }}
              className="flex items-center gap-2 cursor-pointer"
              variant={response?.success ? "outline" : "default"}
              type="button"
            >
              <TrendingUp className="h-4 w-4" />
              {showKpiView ? "Hide Analytics" : "View Analytics"}
            </Button>
              
              {/* Insights Button */}
              {hasInsights ? (
                <Button
                  onClick={handleDownloadInsights}
                  disabled={isDownloadingInsights}
                  className="flex items-center gap-2 cursor-pointer bg-white text-black border-black hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  variant="outline"
                  type="button"
                >
                  {isDownloadingInsights ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Download Insights
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowInsightsView(true);
                    if (showKpiView) setShowKpiView(false);
                    setTriggerInsightsGeneration(true);
                  }}
                  disabled={isGeneratingInsights}
                  className="flex items-center gap-2 cursor-pointer bg-white text-black border-black hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  variant="outline"
                  type="button"
                >
                  {isGeneratingInsights ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      Generate Insights
                    </>
                  )}
                </Button>
              )}
            </>
          )}
          
          {/* Ask AI Button */}
          {fileDetails && (
            <Button
              onClick={() => setShowChatbot(true)}
              className="flex items-center gap-2"
              variant="outline"
            >
              <Bot className="h-4 w-4" />
              Ask AI
            </Button>
          )}

          {/* Connect Power BI Button */}
          <Button 
            onClick={handleConnectPowerBI}
            variant="outline"
            className="flex items-center gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            Connect to Power BI
          </Button>
          
          {/* Tableau Connection Buttons - Only show if Tableau connected */}
          {/* {response?.success && response.data?.workbook?.sheetUrl && (
            <Button
              variant={isEditMode ? "default" : "outline"}
              size="sm"
              onClick={() => setIsEditMode(!isEditMode)}
              className="flex items-center gap-2"
            >
              {isEditMode ? <Eye className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
              {isEditMode ? "View Mode" : "Edit Mode"}
            </Button>
          )} */}
          
          {/* Connect Tableau Button - Only show if not connected */}
          {!response?.success && (
            <Button 
              onClick={handleSubmit} 
              disabled={isUploading}
              variant={hasKpiAnalysis ? "outline" : "default"}
            >
              {isUploading ? "Connecting..." : "Connect to Tableau"}
            </Button>
          )}
        </div>
      </div>

      {/* CSV Table */}
      {!response?.success && !showKpiView && (
        <div className="overflow-x-auto border rounded-xl mb-6">
          {csvData.length > 0 ? (
            <table className="min-w-full text-sm text-left">
              <thead className="bg-gray-100">
                <tr>
                  {Object.keys(csvData[0]).map((key) => (
                    <th key={key} className="px-4 py-2 font-semibold">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvData.map((row, i) => (
                  <tr key={i} className="border-t">
                    {Object.values(row).map((value, j) => (
                      <td key={j} className="px-4 py-2">{value as string}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 gap-4">
              <BarGraphLoader barCount={6} height={100} />
              <p className="text-gray-500 text-sm">Loading CSV content...</p>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      {/* KPI Analytics View */}
      {showKpiView && (
        <div className="space-y-6">
          {/* <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">KPI Analytics</h2>
          </div> */}
          
          {isGeneratingKPI ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-gray-600">Generating KPI analysis...</p>
            </div>
          ) : kpiAnalysis ? (
            <>
              {/* <div className="mb-8">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Analysis Summary</h3>
                <p className="text-gray-600 text-lg">{kpiAnalysis.summary}</p>
              </div> */}

              {/* KPI Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                {kpiAnalysis.metrics.map((metric, index) => (
                  <div key={`chart-wrapper-${index}`} className="flex">
                    <KPIChart
                      key={`chart-${index}`}
                      title={metric.name}
                      description={metric.description}
                      chartType={metric.chartType as any}
                      data={csvData as any}
                      chartConfig={metric.chartConfig}
                      sqlQuery={metric.sqlQuery}
                      xAxisQuery={metric.xAxisQuery}
                      category={metric.category}
                      showDeleteButton={true}
                      onDelete={() => setDeletingMetricIndex(index)}
                      kpiAnalysisId={fileDetails?.kpi_analysis_id}
                      metricIndex={index}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">No KPI analysis available</p>
            </div>
          )}
        </div>
      )}

      {/* Insights Generation View */}
      {showInsightsView && !response?.success && fileDetails && hasKpiAnalysis && !hasInsights && (
        <div className="space-y-6 mt-6">
          <div className="border-b pb-4">
            <h2 className="text-2xl font-bold text-gray-900">Data Insights</h2>
            <p className="text-gray-600 mt-1">
              Generate comprehensive insights document from your KPI analysis
            </p>
          </div>
          <InsightsViewer 
            fileId={Array.isArray(fileId) ? fileId[0] : fileId} 
            fileDetails={fileDetails}
            triggerGeneration={triggerInsightsGeneration}
            onGeneratingChange={(isGenerating) => {
              setIsGeneratingInsights(isGenerating);
              if (isGenerating && triggerInsightsGeneration) {
                setTriggerInsightsGeneration(false);
              }
            }}
            onInsightsGenerated={() => {
              setTriggerInsightsGeneration(false);
              const refreshFileDetails = async () => {
                const normalizedFileId = Array.isArray(fileId) ? fileId[0] : fileId;
                const { data } = await supabase
                  .from("files")
                  .select("*")
                  .eq("id", normalizedFileId)
                  .single();
                if (data) {
                  setFileDetails(data);
                  setHasInsights(data.insights && data.insights.trim() !== '');
                }
              };
              refreshFileDetails();
            }}
          />
        </div>
      )}


      {/* Tableau Embed */}
      {response?.success && response.data?.workbook?.sheetUrl && !showKpiView && (
        <div>
          <div className="rounded-xl border mb-4" style={{ width: '100%', height: '700px' }}>
            <TableauViz 
              src={response.data.workbook.sheetUrl}
              hideTabs={!isEditMode}
              hideToolbar={!isEditMode}
              allowEdit={isEditMode}
              allowWebAuthoring={isEditMode}
              device="desktop"
            />
          </div>
          <div className="p-4 bg-gray-50 rounded-md">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Embed URL</h3>
            <pre className="text-xs text-gray-600 p-3 rounded border overflow-x-auto whitespace-pre-wrap break-words">
              <code>{response.data.workbook.sheetUrl}</code>
            </pre>
            {/* {isEditMode && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-800">
                  <strong>Edit Mode:</strong> You can now edit the visualization directly. 
                  Changes will be saved to your Tableau workbook.
                </p>
              </div>
            )} */}
          </div>
        </div>
      )}

      {/* Power BI Connection Dialog */}
      <Dialog open={showPowerBIDialog} onOpenChange={setShowPowerBIDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect to Power BI</DialogTitle>
            <DialogDescription>
              Use the URL below to connect this datasource to Power BI.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="space-y-2">
              <h4 className="font-medium leading-none">Instructions</h4>
              <ol className="text-sm text-muted-foreground list-decimal pl-4 space-y-1">
                <li>Open Power BI Desktop</li>
                <li>Click on <strong>Get Data</strong> {'>'} <strong>Web</strong></li>
                <li>Paste the URL below into the URL field</li>
                <li>Click <strong>OK</strong> to load your data</li>
              </ol>
            </div>
            <div className="flex items-center space-x-2">
              <div className="grid flex-1 gap-2">
                <Label htmlFor="link" className="sr-only">
                  Link
                </Label>
                <Input
                  id="link"
                  defaultValue={powerBIUrl}
                  readOnly
                />
              </div>
              <Button type="submit" size="sm" className="px-3" onClick={copyToClipboard}>
                {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="sr-only">Copy</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Note: This secure link is valid for 7 days. You will need to generate a new link after it expires.
            </p>
          </div>
          <DialogFooter className="sm:justify-start">
            <Button type="button" variant="secondary" onClick={() => setShowPowerBIDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deletingMetricIndex !== null} onOpenChange={() => setDeletingMetricIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete KPI Metric</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this KPI metric? This action cannot be undone.
              {deletingMetricIndex !== null && kpiAnalysis?.metrics[deletingMetricIndex] && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                  <strong>Metric:</strong> {kpiAnalysis.metrics[deletingMetricIndex].name}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingMetricIndex !== null && handleDeleteMetric(deletingMetricIndex)}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Chatbot */}
      {showChatbot && fileDetails && (
        <CSVChatbot 
          file={{
            ...fileDetails,
            name: fileDetails.file_name || fileDetails.name || "CSV File"
          } as any} 
          onClose={() => setShowChatbot(false)} 
        />
      )}
    </div>
  );
}
