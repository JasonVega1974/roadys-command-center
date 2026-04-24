export type Vendor = {
  id: string;
  name: string;
  program: 'PVP' | 'Entegra' | 'Shop' | 'Approved Vendor' | 'NO VP' | string;
  priority: 'High' | 'Medium' | 'Low' | string;
  status: 'Active' | string;
  phone: string;
};

export type Member = {
  id: string;
  company: string;
  type: 'Truck Stop' | 'Service Center' | string;
  group: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  exit: string;
  phone: string;
  status: 'active' | string;
};

export type VPEnroll = Record<string, Record<string, boolean>>;

export type ROIRecord = {
  stop_id: string;
  vendor_id: string;
  monthly_spend: number;
  rebate_pct: number;
  rebate_amount: number;
  savings_pct: number;
  cost_savings: number;
  rebate_desc?: string;
  months_data?: number;
};

export type VendorDefault = { pct: number; rebate: number };
export type VendorDefaults = Record<string, VendorDefault>;

export type ProgramDetail = Record<string, unknown>;

export type SyscoStatus = Record<string, string>;

export type GSName =
  | 'Shannon Bumbalough'
  | 'Steph Leslie'
  | 'Maria Coleman'
  | 'Stefanie Ritter'
  | 'Burt Newman'
  | 'Logan';
