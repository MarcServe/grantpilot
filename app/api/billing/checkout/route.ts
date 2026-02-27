import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveOrg } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";

const checkoutSchema = z.object({
  priceId: z.string().min(1),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { user, org, orgId, role } = await getActiveOrg();

    if (role !== "OWNER" && role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only organisation owners or admins can manage billing." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const stripe = getStripe();

    let customerId = org.stripeId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { organisationId: orgId },
      });
      customerId = customer.id;
      await prisma.organisation.update({
        where: { id: orgId },
        data: { stripeId: customerId },
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: parsed.data.priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?billing=success`,
      cancel_url: `${appUrl}/dashboard?billing=cancelled`,
      metadata: { priceId: parsed.data.priceId },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[BILLING_CHECKOUT]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
