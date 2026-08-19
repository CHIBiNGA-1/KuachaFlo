export type Category = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
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
