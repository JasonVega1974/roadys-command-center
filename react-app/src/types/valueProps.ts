export type FleetMatch = {
  fleet: string;
  city: string;
  state: string;
  gallons: number;
  dist?: number;
};

export type ValueProp = {
  id: string;
  name: string;
  city: string;
  state: string;
  address?: string;
  assigned?: string;
  aggPot: number;
  fleetPot: number;
  totalPot: number;
  winnable: number;
  fleetMatches: FleetMatch[];
  fleetCount: number;
  notes?: string;
  radius: number;
  status: string;
  pos?: string;
  siteStatus?: string;
  requestedBy?: string;
  requestedDate?: string;
  excludedFleetsList?: string[];
  created?: string;
};

export type ImportedFleets = Record<string, Array<{ c: string; s: string; g: number }>>;
