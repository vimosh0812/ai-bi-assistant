"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Bot, User, Loader2, X, BarChart3, Database, ChevronRight } from "lucide-react"
import type { File } from "@/types/database"
import { ChartViewer } from "@/components/chart-viewer"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  sql?: string
  preprocessing?: string
  result?: any
  sqlError?: string
  chartData?: any
  intent?: string
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
  const [showTableView, setShowTableView] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (file) {
      // Only set initial message if messages array is empty (first time opening)
      setMessages((prev) => {
        if (prev.length === 0) {
          return [
            {
              id: "1",
              role: "assistant",
              content: `Hello! I'm here to help you analyze the data in "${file.name}". You can ask questions, request summaries, preprocessing, or charts. What would you like to know?`,
              timestamp: new Date(),
            },
          ]
        }
        return prev; // Keep existing messages
      })
    } else {
      setMessages([])
    }
  }, [file])

  useEffect(() => {
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

    // Store the user message content before clearing input
    const userMessageContent = input.trim()
    
    // Add user message to state immediately - use functional update to ensure it's added
    setMessages((prev) => {
      // Check if message already exists to avoid duplicates
      const exists = prev.some(msg => msg.id === userMessage.id)
      return exists ? prev : [...prev, userMessage]
    })
    
    setInput("")
    setIsLoading(true)

    try {
      // Prepare conversation history - include all previous messages plus the new one
      // Format them for the API (role and content only)
      const conversationHistory = [...messages, userMessage].map((msg) => ({
        role: msg.role,
        content: msg.content,
      }))

      // Check if file has table_name before making request
      if (!file.table_name) {
        throw new Error("This file doesn't have a database table yet. Please ensure the file was uploaded successfully with a temporary table created.")
      }

      const response = await fetch("/api/chat-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessageContent, // Use stored message content
          fileId: file.id,
          tableName: file.table_name,
          messages: conversationHistory, // Send all messages for context
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to get response")
      }

      const data = await response.json()

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.explanation || "No response from assistant.",
        sql: data.sql || undefined,
        preprocessing: data.preprocessing || undefined,
        result: data.result || undefined,
        sqlError: data.sqlError || undefined,
        chartData: data.chartData || undefined,
        intent: data.intent || data.needsSQL ? "sql_needed" : "context_only",
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error("Error:", error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: error instanceof Error 
          ? `I'm sorry, I encountered an error: ${error.message}. Please try again.`
          : "I'm sorry, I encountered an error while processing your question. Please try again.",
        timestamp: new Date(),
      }
      // Make sure we add the error message to the current state, not overwrite
      setMessages((prev) => {
        // Check if user message is already there, if not add it
        const hasUserMessage = prev.some(msg => msg.id === userMessage.id);
        const messagesToUpdate = hasUserMessage ? prev : [...prev, userMessage];
        return [...messagesToUpdate, errorMessage];
      })
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
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
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

                  {/* {message.intent && (
                    <div className="mt-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded text-xs">
                      <p className="font-semibold mb-1">Detected Intent:</p>
                      <span className="text-xs">{message.intent}</span>
                    </div>
                  )} */}
                    {/* <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-xs">
                      <p className="font-semibold mb-1">Preprocessing SQL (Temporary):</p>
                      <code className="text-xs">{message.preprocessing}</code>
                    </div> */}
                  

                  {/* {message.sql && (
                    <div className="mt-2 p-2 bg-muted/50 rounded text-xs border border-border">
                      <p className="font-semibold mb-1 text-foreground">SQL Used:</p>
                      <div className="text-xs text-foreground bg-background p-2 rounded font-mono border border-border/50 overflow-hidden">
                        <code 
                          className="block break-words whitespace-pre-wrap"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '100%'
                          }}
                        >
                          {message.sql}
                        </code>
                      </div>
                    </div>
                  )} */}

                  {message.chartData ? (
                    // Show chart with toggle buttons (like KPI chart)
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant={!showTableView[message.id] ? "default" : "outline"}
                            size="sm"
                            onClick={() => setShowTableView(prev => ({ ...prev, [message.id]: false }))}
                            className="text-xs"
                          >
                            <Database className="h-3 w-3 mr-1" />
                            Chart
                          </Button>
                          <Button
                            variant={showTableView[message.id] ? "default" : "outline"}
                            size="sm"
                            onClick={() => setShowTableView(prev => ({ ...prev, [message.id]: true }))}
                            className="text-xs"
                          >
                            <ChevronRight className="h-3 w-3 mr-1" />
                            Table
                          </Button>
                        </div>
                        {showTableView[message.id] && message.result && Array.isArray(message.result) && (
                          <div className="text-xs text-muted-foreground">
                            {message.result.length} rows
                          </div>
                        )}
                      </div>
                      {showTableView[message.id] ? (
                        // Table View
                        message.result && Array.isArray(message.result) && message.result.length > 0 ? (
                          <div className="max-h-96 overflow-auto">
                            <div className="min-w-full">
                              <table className="w-full text-sm border-collapse">
                                <thead className="bg-gray-50 sticky top-0">
                                  <tr>
                                    {Object.keys(message.result[0]).map((key) => (
                                      <th key={key} className="px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200">
                                        {key}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {message.result.map((row: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                      {Object.keys(message.result[0]).map((key) => (
                                        <td key={key} className="px-3 py-2 border-b border-gray-200 text-gray-900">
                                          {typeof row[key] === 'number' 
                                            ? row[key].toLocaleString() 
                                            : String(row[key] ?? '')}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <div className="h-32 flex items-center justify-center text-gray-500">
                            No data available
                          </div>
                        )
                      ) : (
                        // Chart View
                        <ChartViewer chartData={message.chartData} />
                      )}
                    </div>
                  ) : (
                    // No chart - show table normally
                    <>
                      {message.result && Array.isArray(message.result) && message.result.length > 0 && (
                        <div className="mt-2 p-2 bg-white rounded text-xs">
                          <div className="max-h-96 overflow-auto">
                            <div className="min-w-full">
                              <table className="w-full text-sm border-collapse">
                                <thead className="bg-gray-50 sticky top-0">
                                  <tr>
                                    {Object.keys(message.result[0]).map((key) => (
                                      <th key={key} className="px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200">
                                        {key}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {message.result.map((row: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                      {Object.keys(message.result[0]).map((key) => (
                                        <td key={key} className="px-3 py-2 border-b border-gray-200 text-gray-900">
                                          {typeof row[key] === 'number' 
                                            ? row[key].toLocaleString() 
                                            : String(row[key] ?? '')}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {message.result && (!Array.isArray(message.result) || message.result.length === 0) && (
                        <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs">
                          <code className="text-xs">{JSON.stringify(message.result, null, 2)}</code>
                        </div>
                      )}
                    </>
                  )}

                  {message.sqlError && (
                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs">
                      <p className="font-semibold mb-1 text-red-600 dark:text-red-400">SQL Error:</p>
                      <code className="text-xs text-red-600 dark:text-red-400 bg-transparent p-0 font-mono break-all">{message.sqlError}</code>
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
