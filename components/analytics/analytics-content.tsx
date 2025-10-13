"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { DEFAULT_NAMES } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import TableauViz from "@/components/tableauviz";
import { ArrowLeft } from "lucide-react";

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

  // Remove the generateEmbedCode function as we'll use the TableauViz component instead

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
          
          </Button>
          <h1 className="text-2xl font-bold">{fileDetails?.file_name || "CSV File"}</h1>
        </div>
        {!response?.success && (
          <Button onClick={handleSubmit} disabled={isUploading}>
            {isUploading ? "Connecting..." : "Connect to Tableau"}
          </Button>
        )}
      </div>

      {/* CSV Table */}
      {!response?.success && (
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

      {/* Tableau Embed */}
      {response?.success && response.data?.workbook?.sheetUrl && (
        <div>
          <div className="rounded-xl border mb-4" style={{ width: '100%', height: '700px' }}>
            <TableauViz 
              src={response.data.workbook.sheetUrl}
              hideTabs={true}
              hideToolbar={false}
            />
          </div>
          <div className="p-4 bg-gray-50 rounded-md">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Embed URL</h3>
            <pre className="text-xs text-gray-600 p-3 rounded border overflow-x-auto whitespace-pre-wrap break-words">
              <code>{response.data.workbook.sheetUrl}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
