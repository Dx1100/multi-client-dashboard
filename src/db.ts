import Dexie, { type Table } from 'dexie';

export interface CampaignRecord {
  id?: number;
  clientName: string;      // Name of client (extracted from file or entered)
  country: string;         // e.g. "IN", "US"
  campaignName: string;    // e.g. "Lead Gen-HD-Domestic-03"
  adSetName: string;       // e.g. "Lead Gen-HD-Domestic-03-TTL"
  leads: number;           // Meta leads
  costPerLead: number;     // Cost per lead
  amountSpent: number;     // Amount spent (INR)
  ctr: number;             // CTR (all)
  reach: number;
  impressions: number;
  clicks: number;
  reportingStarts: string; // YYYY-MM-DD
  reportingEnds: string;   // YYYY-MM-DD
  uploadTimestamp: number; // For keeping track of upload batches
  purchases?: number;
  purchaseValue?: number;
  costPerPurchase?: number;
  roas?: number;
}

export class AnalyticsDatabase extends Dexie {
  campaigns!: Table<CampaignRecord>;

  constructor() {
    super('AnalyticsDatabase');
    this.version(2).stores({
      campaigns: '++id, clientName, campaignName, reportingStarts, reportingEnds, [clientName+campaignName+adSetName+reportingStarts+reportingEnds]'
    });
  }

  /**
   * Bulk insert or update records. Deduplicates by clientName, campaignName, adSetName, reportingStarts, reportingEnds.
   */
  async upsertRecords(records: CampaignRecord[]) {
    return this.transaction('rw', this.campaigns, async () => {
      for (const record of records) {
        // Find existing record matching compound key
        const existing = await this.campaigns.where({
          clientName: record.clientName,
          campaignName: record.campaignName,
          adSetName: record.adSetName,
          reportingStarts: record.reportingStarts,
          reportingEnds: record.reportingEnds
        }).first();

        if (existing) {
          // Update existing record with newer metrics
          await this.campaigns.update(existing.id!, {
            leads: record.leads,
            costPerLead: record.costPerLead,
            amountSpent: record.amountSpent,
            ctr: record.ctr,
            reach: record.reach,
            impressions: record.impressions,
            clicks: record.clicks,
            purchases: record.purchases ?? 0,
            purchaseValue: record.purchaseValue ?? 0,
            costPerPurchase: record.costPerPurchase ?? 0,
            roas: record.roas ?? 0,
            uploadTimestamp: record.uploadTimestamp
          });
        } else {
          // Add brand new record
          await this.campaigns.add(record);
        }
      }
    });
  }
}

export const db = new AnalyticsDatabase();
