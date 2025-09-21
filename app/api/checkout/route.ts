import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server"; // For Next.js 13 app directory

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

export async function POST(req: Request) {
  try {
    const { packageId } = await req.json();

    // Map your frontend package IDs to Stripe price IDs (recurring prices)
    const priceMap: Record<string, string> = {
      starter: "price_1S6mUpCQI9GBPUHNr3HxB0Rt",
      pro: "price_1S6mVGCQI9GBPUHNPf5ocPWJ",
      premium: "price_1S6mVWCQI9GBPUHNsdRJ3BRQ",
    };

    const priceId = priceMap[packageId];
    if (!priceId) {
      return NextResponse.json({ error: "Invalid package" }, { status: 400 });
    }

    // Create Stripe Checkout Session for subscription
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription", // subscription mode
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/cancel`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe Checkout Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}