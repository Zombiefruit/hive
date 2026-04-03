/**
 * Structured business context — parsed from the business context agent output.
 */

export interface BusinessContext {
  company: {
    name: string;
    mission: string;
    market: string;
    stage: string;
  };
  priorities: Array<{
    title: string;
    description: string;
    owner?: string;
  }>;
  productFocus: Array<{
    area: string;
    status: string;
    details?: string;
  }>;
  team: Array<{
    name: string;
    role: string;
    focus?: string;
  }>;
  customerIntel: Array<{
    theme: string;
    frequency: "high" | "medium" | "low";
    details?: string;
  }>;
  technicalContext: Array<{
    area: string;
    status: string;
    details?: string;
  }>;
  lastUpdated: string;
}
