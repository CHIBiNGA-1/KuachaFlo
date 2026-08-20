export type Category = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
};

export type UserProfile = {
  id: string;
  email: string;
  plan: "free" | "pro" | "business";
  currency: string;
  created_at: string;
};

export type PaymentRequest = {
  id: string;
  plan_requested: "pro" | "business";
  amount: number;
  currency: string;
  momo_network: "airtel" | "mtn";
  momo_reference: string;
  status: "pending" | "confirmed" | "rejected";
  created_at: string;
};

export type ReceiptResult = {
  id: string;
  merchant: string | null;
  total_amount: number | null;
  purchase_date: string | null;
  currency: string;
  confidence: "high" | "medium" | "low" | null;
  thumbnail_path: string | null;
  image_path: string | null;
  status: "processed" | "failed" | "needs_review";
  category_id: string | null;
  created_at: string;
};
