import { api } from '@/services/apiClient';

export type ZatcaEnvironment = 'sandbox' | 'simulation' | 'production';

export interface ZatcaDetails {
  sellerNameAr: string;
  sellerNameEn: string;
  vatNumber: string;
  crNumber: string;
  buildingNumber: string;
  street: string;
  district: string;
  city: string;
  postalCode: string;
  additionalNumber: string;
  branchName: string;
  industry: string;
  deviceName: string;
  deviceSerial: string;
  invoiceTypes: string;
}

export interface ZatcaSetup {
  environment: ZatcaEnvironment;
  status: 'draft' | 'csr_ready' | 'compliance' | 'live';
  details: ZatcaDetails;
  steps: { details: boolean; csr: boolean; compliance: boolean; live: boolean };
  lastError: string | null;
}

export const zatcaSetupApi = {
  get: () => api.get<ZatcaSetup>('/api/zatca/setup'),
  save: (environment: ZatcaEnvironment, details: ZatcaDetails) => api.put<ZatcaSetup>('/api/zatca/setup', { environment, details }),
  csr: () => api.post<ZatcaSetup>('/api/zatca/setup/csr', {}),
  onboard: (otp: string) => api.post<ZatcaSetup>('/api/zatca/setup/onboard', { otp }),
  production: () => api.post<ZatcaSetup>('/api/zatca/setup/production', {}),
};
