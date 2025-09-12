"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useRealtimeMetrics } from "@/hooks/use-realtime-metrics"
import { useNavigationSync } from "@/hooks/use-navigation-sync"
import { BarChart3, TrendingUp, Users, Database, Activity, ArrowUpRight, ArrowDownRight, RefreshCw } from "lucide-react"

export function DashboardContent() {
  const { metrics, loading, refreshMetrics } = useRealtimeMetrics()
  useNavigationSync()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
          <p className="text-muted-foreground">Monitor your business intelligence metrics and insights</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={refreshMetrics} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <p className="text-xs text-muted-foreground">Last updated: {metrics.lastUpdated.toLocaleTimeString()}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${metrics.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center text-xs text-muted-foreground">
              <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
              +20.1% from last month
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.activeUsers.toLocaleString()}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
              +180.1% from last month
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Data Sources</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.dataSources}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
              +2 new this month
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.systemHealth.toFixed(1)}%</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <ArrowDownRight className="h-3 w-3 text-red-500 mr-1" />
              -0.1% from last month
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Recent Analytics */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Recent Analytics</CardTitle>
            <CardDescription>Latest insights from your data sources</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {
                  title: "Sales Performance Q4",
                  description: "Revenue increased by 23% compared to Q3",
                  status: "positive",
                  time: "2 hours ago",
                },
                {
                  title: "Customer Acquisition",
                  description: "New customer signups down 5% this week",
                  status: "negative",
                  time: "4 hours ago",
                },
                {
                  title: "Product Usage Analytics",
                  description: "Feature adoption rate improved by 15%",
                  status: "positive",
                  time: "6 hours ago",
                },
              ].map((item, index) => (
                <div key={index} className="flex items-start space-x-4 p-3 rounded-lg border">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-medium">{item.title}</h4>
                      <Badge variant={item.status === "positive" ? "default" : "destructive"}>
                        {item.status === "positive" ? "Positive" : "Attention"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                    <p className="text-xs text-muted-foreground mt-2">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start bg-transparent" variant="outline">
              <BarChart3 className="mr-2 h-4 w-4" />
              Generate Report
            </Button>
            <Button className="w-full justify-start bg-transparent" variant="outline">
              <Database className="mr-2 h-4 w-4" />
              Connect Data Source
            </Button>
            <Button className="w-full justify-start bg-transparent" variant="outline">
              <TrendingUp className="mr-2 h-4 w-4" />
              View Analytics
            </Button>
            <Button className="w-full justify-start bg-transparent" variant="outline">
              <Users className="mr-2 h-4 w-4" />
              Manage Users
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Data Sources Status */}
      <Card>
        <CardHeader>
          <CardTitle>Data Sources Status</CardTitle>
          <CardDescription>Monitor the health and status of your connected data sources</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { name: "PostgreSQL", status: "Connected", health: "Healthy" },
              { name: "Google Analytics", status: "Connected", health: "Healthy" },
              { name: "Salesforce", status: "Connected", health: "Warning" },
              { name: "Stripe", status: "Disconnected", health: "Error" },
            ].map((source, index) => (
              <div key={index} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{source.name}</h4>
                  <Badge
                    variant={
                      source.health === "Healthy"
                        ? "default"
                        : source.health === "Warning"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {source.health}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{source.status}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
