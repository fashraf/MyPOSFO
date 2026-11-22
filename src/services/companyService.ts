import { USE_MOCKS } from '@/config/env';
import { billTemplateApi, companyApi } from './api';
import type { BillTemplate, CompanyProfile } from '@/types/company';
import { DEFAULT_BILL_TEMPLATE } from '@/types/company';
import { HttpError } from './http';
import { delay, nextId, notFound, timestamp, validationFailed, clone } from './mock/store';
import { registerSlice } from './mock/db';
import { seedFor } from './mock/seed';

const now = '2026-08-01T00:00:00.000Z';

let profile: CompanyProfile = {
  nameEn: 'Al Noor Store',
  nameAr: 'متجر النور',
  description: 'Your trusted neighbourhood store',
  logoUrl: null,
  crNumber: '1010123456',
  vatNumber: '300000000000003',
  phone: '+966 11 220 8899',
  email: 'hello@alnoor.sa',
  website: 'alnoor.sa',
  address: {
    street: 'King Fahd Road',
    district: 'Al Olaya',
    city: 'Riyadh',
    postalCode: '12211',
    country: 'SA',
  },
  social: {
    instagram: '@alnoorstore',
    facebook: '',
    x: '',
    tiktok: '',
    linkedin: '',
    youtube: '',
  },
  createdAt: now,
  updatedAt: now,
};



export const companyService = {
  async get(): Promise<CompanyProfile> {
    if (!USE_MOCKS) {
      const row = await companyApi.get();
      return fromRow(row);
    }

    await delay(160);
    return profile;
  },

  async update(input: Omit<CompanyProfile, 'createdAt' | 'updatedAt'>): Promise<CompanyProfile> {
    if (!USE_MOCKS) {
      const source = input as unknown as Record<string, unknown>;

      await companyApi.save({
        nameAr: String(source.nameAr ?? ''),
        nameEn: String(source.nameEn ?? ''),
        descriptionAr: (source.descriptionAr as string) ?? null,
        descriptionEn: (source.descriptionEn as string) ?? null,
        logoUrl: (source.logoUrl as string) ?? null,
        crNumber: (source.crNumber as string) ?? null,
        /* The procedure refuses anything that is not fifteen digits — a wrong
           VAT number prints on every invoice. */
        vatNumber: (source.vatNumber as string) ?? null,
        phone: (source.phone as string) ?? null,
        email: (source.email as string) ?? null,
        website: (source.website as string) ?? null,
        street: (source.street as string) ?? null,
        district: (source.district as string) ?? null,
        city: (source.city as string) ?? null,
        postalCode: (source.postalCode as string) ?? null,
        country: (source.country as string) ?? null,
      });

      return companyService.get();
    }

    await delay(360);

    const errors: Record<string, string[]> = {};
    if (!input.nameEn.trim()) errors.nameEn = ['Company name is required.'];
    if (!input.nameAr.trim()) errors.nameAr = ['Arabic company name is required.'];

    const cr = input.crNumber.trim();
    if (cr && !/^\d{10}$/.test(cr)) errors.crNumber = ['A CR number is 10 digits.'];

    const vat = input.vatNumber.trim();
    if (vat && !/^\d{15}$/.test(vat)) {
      errors.vatNumber = ['A Saudi VAT number is exactly 15 digits.'];
    }

    if (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
      errors.email = ['Enter a valid email address, or leave it empty.'];
    }

    if (Object.keys(errors).length > 0) throw validationFailed(errors);

    profile = { ...profile, ...input, updatedAt: timestamp() };
    return profile;
  },
};

/* A shop prints more than one document, so templates are a collection. The
   seeds mirror the print groups: one customer bill, one ticket per station. */
let templates: BillTemplate[] = [
  {
    ...DEFAULT_BILL_TEMPLATE,
    id: 'bil_customer',
    name: 'Customer bill',
    createdAt: now,
    updatedAt: now,
  },
  {
    ...DEFAULT_BILL_TEMPLATE,
    id: 'bil_kitchen',
    name: 'Kitchen ticket',
    audience: 'group',
    printGroupId: 'pgr_kitchen',
    isDefault: false,
    paperSize: '58mm',
    language: 'both',
    /* An operational ticket needs the item and the count, nothing else — money
       on a kitchen ticket is noise the cook has to read past. */
    showLogo: false,
    showDescription: false,
    showVatNumber: false,
    showCrNumber: false,
    showUnitPrice: false,
    showLineTotal: false,
    showSubtotal: false,
    showDiscount: false,
    showVat: false,
    showGrandTotal: false,
    showZatcaQr: false,
    createdAt: now,
    updatedAt: now,
  },
  {
    ...DEFAULT_BILL_TEMPLATE,
    id: 'bil_bbq',
    name: 'BBQ ticket',
    audience: 'group',
    printGroupId: 'pgr_bbq',
    isDefault: false,
    paperSize: '58mm',
    showLogo: false,
    showDescription: false,
    showVatNumber: false,
    showCrNumber: false,
    showUnitPrice: false,
    showLineTotal: false,
    showSubtotal: false,
    showDiscount: false,
    showVat: false,
    showGrandTotal: false,
    showZatcaQr: false,
    createdAt: now,
    updatedAt: now,
  },
];
/* Tenant state, owned by the mock database (see mock/db.ts). The values above
   are this module's factory defaults; each tenant starts from a copy. */
const INITIAL_COMPANY = clone({ profile, templates });

registerSlice('company', {
  capture: () => ({ profile, templates }),
  restore: (s: typeof INITIAL_COMPANY) => {
    if (!s || typeof s !== 'object') throw new Error('company snapshot is malformed');
    profile = s.profile ?? INITIAL_COMPANY.profile;
    templates = s.templates ?? INITIAL_COMPANY.templates;
  },
  seed: (tenantId) => {
    void tenantId;
    const initial = clone(INITIAL_COMPANY);
    profile = initial.profile;
    templates = initial.templates;
    profile = seedFor(tenantId).company;
  },
});


export const billTemplateService = {
  async list(): Promise<BillTemplate[]> {
    if (!USE_MOCKS) {
      const rows = await billTemplateApi.list();
      return rows.map(toTemplate);
    }

    await delay(140);
    return [...templates];
  },

  async get(id: string): Promise<BillTemplate> {
    await delay(120);
    const template = templates.find((candidate) => candidate.id === id);
    if (!template) throw notFound('Bill template', id);
    return template;
  },

  async create(input: Omit<BillTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<BillTemplate> {
    if (!USE_MOCKS) {
      const saved = await billTemplateApi.create(toTemplateBody(input));
      const rows = await billTemplateApi.list();
      const found = rows.map(toTemplate).find((t) => t.id === saved.billId);
      if (!found) throw new Error('The template was saved but could not be read back.');
      return found;
    }

    await delay(320);

    if (!input.name.trim()) {
      throw validationFailed({ name: ['Give the template a name.'] });
    }
    if (input.audience === 'group' && !input.printGroupId) {
      throw validationFailed({
        printGroupId: ['Choose which print group this ticket is for.'],
      });
    }

    const stamp = timestamp();
    const created: BillTemplate = {
      ...input,
      name: input.name.trim(),
      id: nextId('bil'),
      createdAt: stamp,
      updatedAt: stamp,
    };

    /* Exactly one default customer bill, always. */
    if (created.isDefault) {
      templates = templates.map((template) => ({ ...template, isDefault: false }));
    }

    templates = [...templates, created];
    return created;
  },

  async update(
    id: string,
    input: Omit<BillTemplate, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<BillTemplate> {
    await delay(320);

    const existing = templates.find((candidate) => candidate.id === id);
    if (!existing) throw notFound('Bill template', id);

    if (input.audience === 'group' && !input.printGroupId) {
      throw validationFailed({
        printGroupId: ['Choose which print group this ticket is for.'],
      });
    }

    const updated: BillTemplate = {
      ...existing,
      ...input,
      name: input.name.trim(),
      updatedAt: timestamp(),
    };

    if (updated.isDefault) {
      templates = templates.map((template) =>
        template.id === id ? template : { ...template, isDefault: false },
      );
    }

    templates = templates.map((template) => (template.id === id ? updated : template));
    return updated;
  },

  async remove(id: string): Promise<void> {
    await delay(280);

    const existing = templates.find((candidate) => candidate.id === id);
    if (!existing) throw notFound('Bill template', id);

    if (existing.isDefault) {
      throw new HttpError({
        status: 409,
        code: 'default_template',
        message: 'Make another template the default before deleting this one.',
      });
    }

    templates = templates.filter((template) => template.id !== id);
  },

  /** The template a given document should print with. */
  async resolveFor(audience: 'customer' | 'group', printGroupId?: string): Promise<BillTemplate> {
    await delay(80);

    if (audience === 'group' && printGroupId) {
      const match = templates.find(
        (template) =>
          template.audience === 'group' &&
          template.printGroupId === printGroupId &&
          template.status === 'active',
      );
      if (match) return match;
    }

    const fallback =
      templates.find((template) => template.audience === 'customer' && template.isDefault) ??
      templates[0];
    return fallback;
  },
};


/** The company row to the profile the screens use. */
function fromRow(row: Record<string, unknown>): CompanyProfile {
  const pick = (name: string) =>
    row[name] ?? row[name.charAt(0).toUpperCase() + name.slice(1)];
  const str = (name: string) => (typeof pick(name) === 'string' ? String(pick(name)) : '');

  return {
    nameAr: str('nameAr'),
    nameEn: str('nameEn'),
    descriptionAr: str('descriptionAr'),
    descriptionEn: str('descriptionEn'),
    logoUrl: str('logoUrl') || null,
    crNumber: str('crNumber'),
    vatNumber: str('vatNumber'),
    phone: str('phone'),
    email: str('email'),
    website: str('website'),
    street: str('street'),
    district: str('district'),
    city: str('city'),
    postalCode: str('postalCode'),
    country: str('country'),
    createdAt: str('createdAtUtc'),
    updatedAt: str('updatedAtUtc'),
  } as unknown as CompanyProfile;
}


const tpick = (row: Record<string, unknown>, k: string) =>
  row[k] ?? row[k.charAt(0).toUpperCase() + k.slice(1)];

/** A template row to the domain type. */
function toTemplate(row: Record<string, unknown>): BillTemplate {
  const flag = (k: string) => tpick(row, k) !== false;

  return {
    id: String(tpick(row, 'billId') ?? ''),
    name: String(tpick(row, 'name') ?? ''),
    audience: String(tpick(row, 'audience') ?? 'customer'),
    printGroupId: (tpick(row, 'printGroupId') as string) ?? null,
    isDefault: tpick(row, 'isDefault') === true,
    paperSize: String(tpick(row, 'paperSize') ?? '80mm'),
    language: String(tpick(row, 'billLanguage') ?? 'both'),
    showLogo: flag('showLogo'),
    showVatNumber: flag('showVatNumber'),
    showCrNumber: tpick(row, 'showCrNumber') === true,
    showUnitPrice: flag('showUnitPrice'),
    showLineTotal: flag('showLineTotal'),
    showSubtotal: flag('showSubtotal'),
    showDiscount: flag('showDiscount'),
    showVat: flag('showVat'),
    showGrandTotal: flag('showGrandTotal'),
    showZatcaQr: flag('showZatcaQr'),
    footerAr: String(tpick(row, 'footerAr') ?? ''),
    footerEn: String(tpick(row, 'footerEn') ?? ''),
    status: tpick(row, 'isActive') === false ? 'inactive' : 'active',
    createdAt: String(tpick(row, 'createdAtUtc') ?? ''),
    updatedAt: String(tpick(row, 'updatedAtUtc') ?? ''),
  } as unknown as BillTemplate;
}

/** The domain shape back to the API's. */
function toTemplateBody(input: unknown): Record<string, unknown> {
  const t = input as Record<string, unknown>;

  return {
    name: t.name, audience: t.audience, printGroupId: t.printGroupId ?? null,
    isDefault: Boolean(t.isDefault), paperSize: t.paperSize ?? '80mm',
    billLanguage: t.language ?? 'both',
    showLogo: t.showLogo, showVatNumber: t.showVatNumber, showCrNumber: t.showCrNumber,
    showUnitPrice: t.showUnitPrice, showLineTotal: t.showLineTotal,
    showSubtotal: t.showSubtotal, showDiscount: t.showDiscount, showVat: t.showVat,
    /* The procedure refuses a customer receipt without a total — a receipt that
       does not show what was charged is not a receipt. */
    showGrandTotal: t.showGrandTotal, showZatcaQr: t.showZatcaQr,
    footerAr: t.footerAr ?? null, footerEn: t.footerEn ?? null,
    isActive: t.status !== 'inactive',
  };
}
