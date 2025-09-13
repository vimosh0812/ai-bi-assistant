"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardLayout } from "@/components/layouts/dashboard-layout"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Activity, Loader2, Star } from "lucide-react"

const packages = [
    {
        id: "starter",
        name: "Starter",
        price: 10,
        priceId: "price_1S6mUpCQI9GBPUHNr3HxB0Rt",
        description: "Basic plan for testing.",
        points: ["Up to 1 project", "Email support", "Limited API access"],
        popular: false,
    },
    {
        id: "pro",
        name: "Pro",
        price: 25,
        priceId: "price_1S6mVGCQI9GBPUHNPf5ocPWJ",
        description: "Pro features for growing projects.",
        points: ["Up to 10 projects", "Priority email support", "Full API access", "Advanced analytics"],
        popular: true,
    },
    {
        id: "premium",
        name: "Premium",
        price: 50,
        priceId: "price_1S6mVWCQI9GBPUHNsdRJ3BRQ",
        description: "All features unlocked.",
        points: ["Unlimited projects", "24/7 chat & email support", "Custom integrations", "Dedicated account manager"],
        popular: false,
    },
]

export default function PaymentDashboard() {
    const [loadingPackage, setLoadingPackage] = useState<string | null>(null)
    const router = useRouter()

    const handleCheckout = async (pkgId: string) => {
        setLoadingPackage(pkgId)
        try {
            // Call backend API to create a Stripe Checkout Session
            const res = await fetch("/api/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ packageId: pkgId }),
            })
            const data = await res.json()
            if (data?.url) {
                // Navigate to Stripe Checkout page
                window.location.href = data.url
            } else {
                throw new Error("Checkout URL not returned")
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoadingPackage(null)
        }
    }

    return (
        <DashboardLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Payment Dashboard</h1>
                        <p className="text-muted-foreground">Select a package and proceed to payment</p>
                    </div>
                </div>

                {/* Tabs */}
                <Tabs defaultValue="packages" className="space-y-6">
                    <TabsList>
                        <TabsTrigger value="packages">Packages</TabsTrigger>
                        <TabsTrigger value="history">Payment History</TabsTrigger>
                    </TabsList>

                    {/* Packages Tab */}
                    <TabsContent value="packages" className="space-y-6">
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {packages.map((pkg) => (
                                <Card
                                    key={pkg.id}
                                    className={`shadow-lg relative ${pkg.popular ? "border-2 border-primary" : ""}`}
                                >
                                    {pkg.popular && (
                                        <div className="absolute top-4 right-4 flex items-center gap-1 text-primary font-semibold text-xs bg-primary/10 px-2 py-1 rounded">
                                            <Star className="h-4 w-4" />
                                            Popular
                                        </div>
                                    )}
                                    <CardHeader>
                                        <CardTitle>{pkg.name}</CardTitle>
                                        <CardDescription>{pkg.description}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex flex-col items-center gap-4">
                                        <p className="text-2xl font-bold">${pkg.price}</p>
                                        <ul className="text-sm text-muted-foreground mb-2 list-disc pl-4 self-start">
                                            {pkg.points.map((point, idx) => (
                                                <li key={idx}>{point}</li>
                                            ))}
                                        </ul>
                                        <Button
                                            className="w-full"
                                            disabled={loadingPackage === pkg.id}
                                            onClick={() => handleCheckout(pkg.id)}
                                        >
                                            {loadingPackage === pkg.id ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                    Processing...
                                                </>
                                            ) : (
                                                `Buy ${pkg.name}`
                                            )}
                                        </Button>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </TabsContent>

                    {/* Payment History Tab */}
                    <TabsContent value="history" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Payment History</CardTitle>
                                <CardDescription>View past payments and transactions</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="h-64 flex items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg">
                                    <div className="text-center">
                                        <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                        <p className="text-muted-foreground">No payment history yet</p>
                                        <p className="text-sm text-muted-foreground">
                                            Your completed transactions will appear here
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    )
}
