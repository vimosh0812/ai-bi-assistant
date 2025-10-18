"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { DEFAULT_NAMES } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import TableauViz from "@/components/tableauviz";
import { ArrowLeft, Edit3, Eye, BarChart3, TrendingUp, Home } from "lucide-react";
import { OpenAIKPIAnalysis } from "@/types/kpi";
import { KPIChart } from "@/components/kpi-chart";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

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
  const { user } = useAuth();

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

  // Fetch file details and CSV content
  useEffect(() => {
    const fetchFile = async () => {
      const { data, error } = await supabase
        .from("files")
        .select("*")
        .eq("id", fileId)
        .single();

      if (error) return console.error(error);
      setFileDetails(data);
      setHasKpiAnalysis(data.has_kpi_analysis || false);

      // Fetch folder name for breadcrumb
      const { data: folderData, error: folderError } = await supabase
        .from("folders")
        .select("name")
        .eq("id", folderId)
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
      } else {
        fetchCsv(data.storage_path);
      }

      // Check if KPI analysis exists
      if (data.has_kpi_analysis) {
        fetchKpiAnalysis();
      }
    };

    const fetchCsv = async (path: string) => {
      const { data, error } = await supabase.storage.from("csv-files").download(path);
      if (error) return console.error(error);

      const text = await data.text();
      const parsed = Papa.parse(text, { header: true });
      setCsvData(parsed.data);
      const filename = path.split("/").pop() || "data.csv";
      setFile(new File([text], filename, { type: "csv" }));
      setPublishType("datasource");
    };

    const fetchKpiAnalysis = async () => {
      try {
        const response = await fetch(`/api/get-kpi-analysis?fileId=${fileId}`);
        const data = await response.json();
        
        if (data.success && data.kpiAnalysis) {
          setKpiAnalysis(data.kpiAnalysis);
        }
      } catch (error) {
        console.error("Error fetching KPI analysis:", error);
      }
    };

    fetchFile();
  }, [fileId]);

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
      // Generate KPI analysis
      const response = await fetch("/api/generate-kpi-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          headers: Object.keys(csvData[0] || {}), 
          rows: csvData,
          fileId: fileDetails.id
        }),
      });
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setKpiAnalysis(data);
      
      // Store the KPI analysis
      const storeResponse = await fetch("/api/store-kpi-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          fileId: fileDetails.id,
          kpiAnalysis: data
        }),
      });
      
      const storeData = await storeResponse.json();
      
      if (storeData.success) {
        setHasKpiAnalysis(true);
        // Update file details
        setFileDetails((prev: any) => ({
          ...prev,
          has_kpi_analysis: true,
          kpi_analysis_id: storeData.kpiAnalysisId
        }));
      }
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGeneratingKPI(false);
    }
  };

  const viewKpiAnalytics = () => {
    console.log("viewKpiAnalytics called", { currentShowKpiView: showKpiView, hasKpiAnalysis, responseSuccess: response?.success });
    setShowKpiView(!showKpiView);
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
                href={`/dashboard/${folderId}`}
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
            onClick={() => router.push(`/dashboard/${folderId}`)}
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
          )}
          
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
            <p className="p-4 text-gray-500">Loading CSV content...</p>
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
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">KPI Analytics</h2>
          </div>
          
          {isGeneratingKPI ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Generating KPI analysis...</p>
              </div>
            </div>
          ) : kpiAnalysis ? (
            <>
              {/* <div className="mb-8">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Analysis Summary</h3>
                <p className="text-gray-600 text-lg">{kpiAnalysis.summary}</p>
              </div> */}

              {/* KPI Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {kpiAnalysis.metrics.map((metric, index) => (
                  <KPIChart
                    key={`chart-${index}`}
                    title={metric.name}
                    description={metric.description}
                    chartType={metric.chartType as any}
                    data={csvData}
                    chartConfig={metric.chartConfig}
                    sqlQuery={metric.sqlQuery}
                    xAxisQuery={metric.xAxisQuery}
                    category={metric.category}
                    fileId={fileId as string}
                    userId={user?.id}
                    showDeleteButton={true}
                    onDelete={() => setDeletingMetricIndex(index)}
                  />
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
    </div>
  );
}
