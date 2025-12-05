export interface ProviderTaxDocMonthlyRow {
  month: string; // YYYY-MM
  gross: number;
  fee: number;
  gst: number;
  net: number;
}

export interface ProviderTaxDocResponse {
  providerId: string;
  businessName: string | null;
  chargesGst: boolean;
  year: number;
  totals: {
    gross: number;
    fee: number;
    gst: number;
    net: number;
    payoutsReceived: number;
    outstandingNet: number;
  };
  monthly: ProviderTaxDocMonthlyRow[];
  payouts: {
    id: string;
    amount: number;
    status: string;
    arrivalDate: string | null;
  }[];
}
