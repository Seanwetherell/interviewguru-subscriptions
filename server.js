import express from "express";
import Stripe from "stripe";
import fetch from "node-fetch";
import bodyParser from "body-parser";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();

app.use(express.json());

// Create checkout session
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { priceId, base44UserId, customerEmail } = req.body;

    if (!priceId || !base44UserId) {
      return res.status(400).json({ error: "missing priceId or base44UserId" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: base44UserId,
      customer_email: customerEmail || undefined,
      success_url: `${process.env.FRONTEND_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: process.env.FRONTEND_CANCEL_URL
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.log("Error creating session:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// Stripe webhook
app.post("/webhook", bodyParser.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  // Subscription success
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const base44UserId = session.client_reference_id;

    // Call Base44 to upgrade role
    fetch(`${process.env.BASE44_API_BASE}/users/${base44UserId}/role`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.BASE44_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ role: "premium" })
    }).catch((e) => console.log("Base44 error:", e));
  }

  res.json({ received: true });
});

app.get("/", (req, res) => {
  res.send("Interview Guru backend is running");
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Server running")
);
