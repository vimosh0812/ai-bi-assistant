"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Bot, User, Loader2, X, BarChart3 } from "lucide-react"
import type { File } from "@/types/database"
import { ChartViewer } from "@/components/chart-viewer"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  sql?: string
  result?: any
  sqlError?: string
  chartData?: any
  timestamp: Date
}

interface CSVChatbotProps {
  file: File | null
  onClose: () => void
  onViewData?: (file: File) => void
}

export function CSVChatbot({ file, onClose, onViewData }: CSVChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (file) {
      // Initialize with welcome message
      setMessages([
        {
          id: "1",
          role: "assistant",
          content: `Hello! I'm here to help you analyze the data in "${file.name}". You can ask me questions about the data, request summaries, or ask for specific insights. I can also suggest Tableau visualizations for your data. What would you like to know?`,
          timestamp: new Date(),
        },
      ])
    } else {
      setMessages([])
    }
  }, [file])

  useEffect(() => {
    // Scroll to bottom when new messages are added
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !file || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/chat-csv", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: input.trim(),
          fileId: file.id,
          tableName: file.table_name,
          messages: messages.slice(-10), // Send last 10 messages for context
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to get response")
      }

      const data = await response.json()

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.explanation || "No response from assistant.",
        sql: data.sql || undefined,
        result: data.result || undefined,
        sqlError: data.sqlError || undefined,
        chartData: data.chartData || undefined,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error("Error:", error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I'm sorry, I encountered an error while processing your question. Please try again.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  if (!file) return null

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50">
      <div className="fixed right-0 top-0 h-full w-[70%] bg-background border-l shadow-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-background">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-600" />
            <h2 className="font-semibold">Chat with {file.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            {onViewData && (
              <Button variant="outline" size="sm" onClick={() => onViewData(file)}>
                <BarChart3 className="h-4 w-4 mr-2" />
                View Data
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`flex gap-3 max-w-[80%] ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    message.role === "user" ? "bg-blue-600" : "bg-green-600"
                  }`}
                >
                  {message.role === "user" ? (
                    <User className="h-4 w-4 text-white" />
                  ) : (
                    <Bot className="h-4 w-4 text-white" />
                  )}
                </div>
                <div
                  className={`rounded-lg px-4 py-2 ${
                    message.role === "user" ? "bg-blue-600 text-white" : "bg-muted text-foreground"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                  {message.sql && (
                    <div className="mt-3 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                      <p className="font-semibold mb-1">SQL Used:</p>
                      <code className="text-xs">{message.sql}</code>
                    </div>
                  )}

                  {message.result && (
                    <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs">
                      <p className="font-semibold mb-1">SQL Results:</p>
                      <div className="max-h-32 overflow-y-auto">
                        {Array.isArray(message.result) ? (
                          <div className="space-y-1">
                            {message.result.slice(0, 10).map((row, idx) => (
                              <div key={idx} className="text-xs">
                                {JSON.stringify(row)}
                              </div>
                            ))}
                            {message.result.length > 10 && (
                              <p className="text-xs text-muted-foreground">
                                ... and {message.result.length - 10} more rows
                              </p>
                            )}
                          </div>
                        ) : (
                          <code className="text-xs">{JSON.stringify(message.result)}</code>
                        )}
                      </div>
                    </div>
                  )}

                  {message.sqlError && (
                    <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs">
                      <p className="font-semibold mb-1 text-red-600">SQL Error:</p>
                      <code className="text-xs text-red-600">{message.sqlError}</code>
                    </div>
                  )}

                  {message.chartData && (
                    <div className="mt-3">
                      <ChartViewer chartData={message.chartData} />
                    </div>
                  )}

                  <p className={`text-xs mt-1 ${message.role === "user" ? "text-blue-100" : "text-muted-foreground"}`}>
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex gap-3 max-w-[80%]">
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-green-600">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="rounded-lg px-4 py-2 bg-muted text-foreground">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Analyzing data...</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t bg-background p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your data or request a chart..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
