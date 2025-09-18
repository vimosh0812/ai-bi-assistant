import { AlertCircle, CheckCircle, Info } from "lucide-react"
 
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"

export type Message =
  | { success: string }
  | { error: string }
  | { message: string };

export function FormMessage({ message }: { message: Message }) {
  if (!message || Object.keys(message).length === 0) {
    return null;
  }
  const variant = "error" in message ? "destructive" : "default";
  const title = "error" in message ? "Error" : "success" in message ? "Success" : "Info";
  return (
    <Alert variant={variant}>
      {"success" in message && <CheckCircle className="h-4 w-4" />}
      {"error" in message && <AlertCircle className="h-4 w-4" />}
      {"message" in message && <Info className="h-4 w-4" />}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {"success" in message && message.success}
        {"error" in message && message.error}
        {"message" in message && message.message}
      </AlertDescription>
    </Alert>
  );
}
