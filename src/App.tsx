import { useState, useEffect, useCallback } from 'react';
import Papa from 'papaparse';
import { db, type CampaignRecord } from './db.js';
import { 
  BarChart3, 
  Upload, 
  Database, 
  TrendingUp, 
  User, 
  Globe, 
  Calendar, 
  Layers,
  Sparkles,
  FileSpreadsheet,
  RefreshCw,
  Trash2,
  Settings,
  SlidersHorizontal
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export interface KPIInfo {
  id: string;
  label: string;
  format: (val: number) => string;
}

export const AVAILABLE_KPIS: KPIInfo[] = [
  { id: 'amountSpent', label: 'Total Ad Spent', format: (val: number) => `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` },
  { id: 'leads', label: 'Meta Leads Generated', format: (val: number) => val.toLocaleString() },
  { id: 'costPerLead', label: 'Cost Per Lead (CPL)', format: (val: number) => `₹${val.toFixed(2)}` },
  { id: 'ctr', label: 'Click Through Rate (CTR)', format: (val: number) => `${val.toFixed(2)}%` },
  { id: 'impressions', label: 'Impressions', format: (val: number) => val.toLocaleString() },
  { id: 'reach', label: 'Reach', format: (val: number) => val.toLocaleString() },
  { id: 'clicks', label: 'Link Clicks', format: (val: number) => val.toLocaleString() },
  { id: 'purchases', label: 'Purchases', format: (val: number) => val.toLocaleString() },
  { id: 'purchaseValue', label: 'Purchase Value (Revenue)', format: (val: number) => `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` },
  { id: 'roas', label: 'ROAS (Return on Ad Spend)', format: (val: number) => `${val.toFixed(2)}x` }
];

export const getKPIValue = (stats: any, kpiId: string): number => {
  if (kpiId === 'amountSpent') return stats.totalSpend;
  if (kpiId === 'leads') return stats.totalLeads;
  if (kpiId === 'costPerLead') return stats.avgCPL;
  if (kpiId === 'ctr') return stats.overallCTR;
  if (kpiId === 'impressions') {
    return stats.records.reduce((sum: number, r: any) => sum + (r.impressions || 0), 0);
  }
  if (kpiId === 'reach') {
    return stats.records.reduce((sum: number, r: any) => sum + (r.reach || 0), 0);
  }
  if (kpiId === 'clicks') {
    return stats.records.reduce((sum: number, r: any) => sum + (r.clicks || 0), 0);
  }
  if (kpiId === 'purchases') return stats.totalPurchases;
  if (kpiId === 'purchaseValue') return stats.totalPurchaseValue;
  if (kpiId === 'roas') return stats.avgROAS;
  return 0;
};

export default function App() {
  // Navigation & Filter states
  const [clients, setClients] = useState<string[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [batches, setBatches] = useState<{ start: string; end: string; label: string }[]>([]);
  const [selectedBatchLabel, setSelectedBatchLabel] = useState<string>('');
  const [countries, setCountries] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL');

  // Custom single period date states
  const [singleCustomStart, setSingleCustomStart] = useState<string>('');
  const [singleCustomEnd, setSingleCustomEnd] = useState<string>('');
  const [useCustomSingleDate, setUseCustomSingleDate] = useState<boolean>(false);

  // Selected KPIs state
  const [selectedKPIs, setSelectedKPIs] = useState<string[]>(['amountSpent', 'leads', 'costPerLead']);

  // Campaign filter states
  const [campaignSearch, setCampaignSearch] = useState<string>('');
  
  // Google Sheets integration configuration
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [spreadsheetId, setSpreadsheetId] = useState<string>(() => {
    return localStorage.getItem('analytics_spreadsheet_id') || '1giV99GWPtoerUO3sv1Uu-UxCFykFTNvYXno81CtG-x8';
  });
  const [sheetSyncLoading, setSheetSyncLoading] = useState<boolean>(false);
  const [sheetSyncError, setSheetSyncError] = useState<string>('');

  // Core Data states
  const [allClientRecords, setAllClientRecords] = useState<CampaignRecord[]>([]);
  const [sortField, setSortField] = useState<string>('amountSpent');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Comparison states
  const [useCompareMode, setUseCompareMode] = useState<boolean>(false);
  const [range1Start, setRange1Start] = useState<string>('');
  const [range1End, setRange1End] = useState<string>('');
  const [range1Label, setRange1Label] = useState<string>('Period A');
  const [range2Start, setRange2Start] = useState<string>('');
  const [range2End, setRange2End] = useState<string>('');
  const [range2Label, setRange2Label] = useState<string>('Period B');
  const [enableRange3, setEnableRange3] = useState<boolean>(false);
  const [range3Start, setRange3Start] = useState<string>('');
  const [range3End, setRange3End] = useState<string>('');
  const [range3Label, setRange3Label] = useState<string>('Period C');

  // Uploader UI states
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string>('');
  const [uploadSuccess, setUploadSuccess] = useState<string>('');
  const [pendingUploads, setPendingUploads] = useState<{
    fileName: string;
    clientName: string;
    dateStarts: string;
    dateEnds: string;
    rows: CampaignRecord[];
  }[]>([]);

  // Chart Metric state
  const [chartMetric, setChartMetric] = useState<'leads' | 'amountSpent' | 'costPerLead' | 'purchases' | 'roas'>('amountSpent');

  // Load clients & initialize
  const refreshMetadata = useCallback(async () => {
    const allRecords = await db.campaigns.toArray();
    const uniqueClients = Array.from(new Set(allRecords.map(r => r.clientName))).sort();
    setClients(uniqueClients);

    if (uniqueClients.length > 0 && !selectedClient) {
      setSelectedClient(uniqueClients[0]);
    }
  }, [selectedClient]);

  useEffect(() => {
    refreshMetadata();
  }, [refreshMetadata]);

  // Load client batches and records
  useEffect(() => {
    if (!selectedClient) return;

    const loadClientData = async () => {
      const recordsForClient = await db.campaigns.where('clientName').equals(selectedClient).toArray();
      setAllClientRecords(recordsForClient);

      // Extract unique reporting starts/ends
      const batchMap = new Map<string, { start: string; end: string }>();
      recordsForClient.forEach(r => {
        const label = `${r.reportingStarts} to ${r.reportingEnds}`;
        batchMap.set(label, { start: r.reportingStarts, end: r.reportingEnds });
      });

      const uniqueBatches = Array.from(batchMap.entries()).map(([label, range]) => ({
        label,
        start: range.start,
        end: range.end
      })).sort((a, b) => b.end.localeCompare(a.end)); // Sort latest first

      setBatches(uniqueBatches);

      if (uniqueBatches.length > 0) {
        const exists = uniqueBatches.some(b => b.label === selectedBatchLabel);
        if (!exists) {
          setSelectedBatchLabel(uniqueBatches[0].label);
        }
      } else {
        setSelectedBatchLabel('');
      }

      // Extract unique countries
      const uniqueCountries = Array.from(new Set(recordsForClient.map(r => r.country))).filter(Boolean).sort();
      setCountries(uniqueCountries);
    };

    loadClientData();
  }, [selectedClient, selectedBatchLabel]);

  // Auto-initialize compare ranges when toggled or client data changes
  useEffect(() => {
    if (useCompareMode && batches.length >= 2) {
      if (!range1Start || !range1End) {
        setRange1Start(batches[0].start);
        setRange1End(batches[0].end);
        setRange1Label(batches[0].label);
      }
      if (!range2Start || !range2End) {
        const idx = Math.min(1, batches.length - 1);
        setRange2Start(batches[idx].start);
        setRange2End(batches[idx].end);
        setRange2Label(batches[idx].label);
      }
    }
  }, [useCompareMode, batches, range1Start, range1End, range2Start, range2End]);

  // Auto-initialize single custom range when batches load
  useEffect(() => {
    if (batches.length > 0) {
      if (!singleCustomStart) setSingleCustomStart(batches[0].start);
      if (!singleCustomEnd) setSingleCustomEnd(batches[0].end);
    }
  }, [batches, singleCustomStart, singleCustomEnd]);

  // Fetch CSV report data directly from Google Sheets Visualization Endpoint
  const handleSheetsSync = async () => {
    if (!selectedClient) return;
    setSheetSyncLoading(true);
    setSheetSyncError('');
    setUploadSuccess('');
    setUploadError('');

    try {
      localStorage.setItem('analytics_spreadsheet_id', spreadsheetId);
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(selectedClient)}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch spreadsheet. Confirm spreadsheet is shared (Anyone with link can view). Status: ${response.status}`);
      }
      
      const csvText = await response.text();
      
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const rows = results.data as any[];
          if (rows.length === 0) {
            setSheetSyncError('The Google Sheet tab appears to contain no data rows.');
            setSheetSyncLoading(false);
            return;
          }

          const mappedRows: CampaignRecord[] = [];
          const batchTimestamp = Date.now();

          const getVal = (row: any, keys: string[], defaultValue = 0) => {
            for (const key of keys) {
              const matchingKey = Object.keys(row).find(k => k.trim().toLowerCase() === key.toLowerCase());
              if (matchingKey && row[matchingKey] !== undefined && row[matchingKey] !== null && row[matchingKey] !== '') {
                const val = row[matchingKey].toString().replace(/[^\d.-]/g, '');
                const parseFloatVal = parseFloat(val);
                if (!isNaN(parseFloatVal)) return parseFloatVal;
              }
            }
            return defaultValue;
          };

          const getStr = (row: any, keys: string[], defaultValue = '') => {
            for (const key of keys) {
              const matchingKey = Object.keys(row).find(k => k.trim().toLowerCase() === key.toLowerCase());
              if (matchingKey) return row[matchingKey]?.toString() || defaultValue;
            }
            return defaultValue;
          };

          rows.forEach(row => {
            const campName = getStr(row, ['Campaign Name', 'campaign_name', 'campaignName', 'Campaign']).trim();
            const dateStr = getStr(row, ['Date', 'date_start', 'Reporting starts', 'date']).trim();
            
            if (!campName || !dateStr) return;

            const amountSpent = getVal(row, ['Spend', 'Amount spent (INR)', 'spent', 'Amount spent', 'amountSpent']);
            const leads = getVal(row, ['Meta Leads', 'leads', 'Leads']);
            const purchases = getVal(row, ['Purchases', 'purchases']);
            const purchaseValue = getVal(row, ['Purchase Value', 'purchaseValue', 'purchase_value']);
            
            mappedRows.push({
              clientName: selectedClient.toUpperCase(),
              country: getStr(row, ['Country', 'country'], 'ALL').trim().toUpperCase(),
              campaignName: campName,
              adSetName: getStr(row, ['Ad Set Name', 'adSetName', 'ad_set_name'], 'Default Ad Set').trim(),
              leads,
              costPerLead: leads > 0 ? amountSpent / leads : 0,
              amountSpent,
              ctr: getVal(row, ['CTR', 'ctr', 'Hook Rate (%)', 'ctr (all)']),
              reach: getVal(row, ['Reach', 'reach']),
              impressions: getVal(row, ['Impressions', 'impressions']),
              clicks: getVal(row, ['Unique Link Clicks', 'clicks', 'Clicks']),
              reportingStarts: dateStr,
              reportingEnds: dateStr,
              uploadTimestamp: batchTimestamp,
              purchases,
              purchaseValue,
              costPerPurchase: purchases > 0 ? amountSpent / purchases : 0,
              roas: amountSpent > 0 ? purchaseValue / amountSpent : 0
            });
          });

          if (mappedRows.length === 0) {
            setSheetSyncError('No valid campaigns could be parsed from Google Sheet headers.');
            setSheetSyncLoading(false);
            return;
          }

          await db.upsertRecords(mappedRows);
          setUploadSuccess(`Successfully synchronized ${mappedRows.length} daily rows from Google Sheets tab '${selectedClient}'!`);
          setSheetSyncLoading(false);
          refreshMetadata();
        },
        error: (error: any) => {
          setSheetSyncError(`CSV Parse Error: ${error.message}`);
          setSheetSyncLoading(false);
        }
      });
    } catch (e: any) {
      setSheetSyncError(`Sync failed: ${e.message}`);
      setSheetSyncLoading(false);
    }
  };

  // Clear/Prune client database
  const handleClearClientData = async () => {
    if (!selectedClient) return;
    if (!window.confirm(`Are you sure you want to permanently delete all dashboard analytics data for client ${selectedClient}?`)) return;
    
    try {
      const recordsForClient = await db.campaigns.where('clientName').equals(selectedClient).toArray();
      const ids = recordsForClient.map(r => r.id!).filter(Boolean);
      
      await db.campaigns.bulkDelete(ids);
      setUploadSuccess(`Pruned all records for client ${selectedClient}.`);
      setSelectedClient('');
      refreshMetadata();
    } catch (e: any) {
      setUploadError(`Clear failed: ${e.message}`);
    }
  };

  // Parse uploaded file
  const handleCSVParse = (file: File) => {
    setUploadError('');
    setUploadSuccess('');

    let guessedClient = 'Client';
    const parts = file.name.split('-');
    if (parts.length > 0 && parts[0].trim().length > 0) {
      guessedClient = parts[0].toUpperCase().trim();
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as any[];
        if (rows.length === 0) {
          setUploadError('CSV file appears to be empty.');
          return;
        }

        const headers = Object.keys(rows[0]);
        const hasCampaign = headers.some(h => /campaign/i.test(h));
        const hasStarts = headers.some(h => /reporting.*start|date/i.test(h));
        const hasEnds = headers.some(h => /reporting.*end|date/i.test(h));

        if (!hasCampaign || !hasStarts || !hasEnds) {
          setUploadError('Invalid headers. CSV must contain "Campaign name", "Reporting starts/Date", and "Reporting ends/Date" columns.');
          return;
        }

        const getVal = (row: any, regex: RegExp, defaultValue: any = 0) => {
          const key = Object.keys(row).find(k => regex.test(k));
          if (!key || row[key] === undefined || row[key] === null || row[key] === '') return defaultValue;
          const val = row[key].toString().replace(/[^\d.-]/g, '');
          return isNaN(parseFloat(val)) ? defaultValue : parseFloat(val);
        };

        const getStr = (row: any, regex: RegExp, defaultVal: string = '') => {
          const key = Object.keys(row).find(k => regex.test(k));
          return key ? row[key]?.toString() || defaultVal : defaultVal;
        };

        const mappedRows: CampaignRecord[] = [];
        let minStart = '';
        let maxEnd = '';

        try {
          const batchTimestamp = Date.now();
          
          rows.forEach((row) => {
            const campName = getStr(row, /campaign/i, '').trim();
            if (!campName) return;

            const rStart = getStr(row, /reporting.*start|date/i, '').trim();
            const rEnd = getStr(row, /reporting.*end|date/i, '').trim();

            if (!minStart || (rStart && rStart < minStart)) minStart = rStart;
            if (!maxEnd || (rEnd && rEnd > maxEnd)) maxEnd = rEnd;

            const amountSpent = getVal(row, /amount.*spent|spent/i, 0);
            const leads = getVal(row, /leads/i, 0);
            const purchases = getVal(row, /purchases/i, 0);
            const purchaseValue = getVal(row, /purchase.*value/i, 0);

            mappedRows.push({
              clientName: guessedClient,
              country: getStr(row, /country/i, 'ALL').trim().toUpperCase(),
              campaignName: campName,
              adSetName: getStr(row, /ad.*set.*name/i, 'Default Ad Set').trim(),
              leads,
              costPerLead: leads > 0 ? amountSpent / leads : 0,
              amountSpent,
              ctr: getVal(row, /ctr|hook.*rate/i, 0),
              reach: getVal(row, /reach/i, 0),
              impressions: getVal(row, /impressions/i, 0),
              clicks: getVal(row, /clicks|unique.*link.*clicks/i, 0),
              reportingStarts: rStart,
              reportingEnds: rEnd,
              uploadTimestamp: batchTimestamp,
              purchases,
              purchaseValue,
              costPerPurchase: purchases > 0 ? amountSpent / purchases : 0,
              roas: amountSpent > 0 ? purchaseValue / amountSpent : 0
            });
          });

          if (mappedRows.length === 0) {
            setUploadError('No valid campaign rows could be parsed.');
            return;
          }

          setPendingUploads(prev => [
            ...prev,
            {
              fileName: file.name,
              clientName: guessedClient,
              dateStarts: minStart,
              dateEnds: maxEnd,
              rows: mappedRows
            }
          ]);
        } catch (e: any) {
          setUploadError(`Failed parsing rows: ${e.message}`);
        }
      },
      error: (error) => {
        setUploadError(`Error loading CSV: ${error.message}`);
      }
    });
  };

  const commitUpload = async (index: number) => {
    const batch = pendingUploads[index];
    try {
      const finalizedRows = batch.rows.map(r => ({
        ...r,
        clientName: batch.clientName.trim().toUpperCase()
      }));

      await db.upsertRecords(finalizedRows);
      setUploadSuccess(`Successfully loaded ${finalizedRows.length} rows for client ${batch.clientName.toUpperCase()}!`);
      setSelectedClient(batch.clientName.toUpperCase());
      setSelectedBatchLabel(`${batch.dateStarts} to ${batch.dateEnds}`);
      setPendingUploads(prev => prev.filter((_, i) => i !== index));
      refreshMetadata();
    } catch (e: any) {
      setUploadError(`Failed inserting database records: ${e.message}`);
    }
  };

  // Drag and drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleCSVParse(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleCSVParse(e.target.files[0]);
    }
  };

  // Fetch aggregated data for a custom date range window
  const getAggregatedDataForRange = useCallback((start: string, end: string) => {
    if (!selectedClient) return { totalSpend: 0, totalLeads: 0, avgCPL: 0, overallCTR: 0, totalPurchases: 0, totalPurchaseValue: 0, avgROAS: 0, records: [] as CampaignRecord[] };

    const rawMatches = allClientRecords.filter(r => {
      const rStart = r.reportingStarts;
      const rEnd = r.reportingEnds;
      // Overlap logic: falls within selected date bounds
      return rStart >= start && rEnd <= end;
    });

    let countryFiltered = rawMatches;
    if (selectedCountry !== 'ALL') {
      countryFiltered = rawMatches.filter(r => r.country === selectedCountry);
    }

    const campaignMap = new Map<string, CampaignRecord>();

    countryFiltered.forEach(r => {
      const key = `${r.campaignName}|||${r.adSetName}|||${r.country}`;
      const existing = campaignMap.get(key);

      if (existing) {
        existing.amountSpent += r.amountSpent;
        existing.leads += r.leads;
        existing.impressions += r.impressions;
        existing.clicks += r.clicks;
        existing.reach += r.reach;
        existing.purchases = (existing.purchases || 0) + (r.purchases || 0);
        existing.purchaseValue = (existing.purchaseValue || 0) + (r.purchaseValue || 0);
      } else {
        campaignMap.set(key, { ...r });
      }
    });

    const aggregatedCampaigns = Array.from(campaignMap.values()).map(r => {
      r.costPerLead = r.leads > 0 ? r.amountSpent / r.leads : 0;
      r.costPerPurchase = (r.purchases && r.purchases > 0) ? r.amountSpent / r.purchases : 0;
      r.roas = (r.purchaseValue && r.amountSpent > 0) ? r.purchaseValue / r.amountSpent : 0;
      r.ctr = r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0;
      return r;
    });

    // Apply campaign name search filter if present
    const searchFiltered = campaignSearch.trim().length > 0
      ? aggregatedCampaigns.filter(r => r.campaignName.toLowerCase().includes(campaignSearch.toLowerCase()) || r.adSetName.toLowerCase().includes(campaignSearch.toLowerCase()))
      : aggregatedCampaigns;

    const spendSum = searchFiltered.reduce((sum, r) => sum + r.amountSpent, 0);
    const leadsSum = searchFiltered.reduce((sum, r) => sum + r.leads, 0);
    const cplAvg = leadsSum > 0 ? spendSum / leadsSum : 0;
    
    const impSum = searchFiltered.reduce((sum, r) => sum + r.impressions, 0);
    const clickSum = searchFiltered.reduce((sum, r) => sum + r.clicks, 0);
    const ctrAvg = impSum > 0 ? (clickSum / impSum) * 100 : 0;

    const purchaseSum = searchFiltered.reduce((sum, r) => sum + (r.purchases || 0), 0);
    const purchaseValSum = searchFiltered.reduce((sum, r) => sum + (r.purchaseValue || 0), 0);
    const roasAvg = spendSum > 0 ? purchaseValSum / spendSum : 0;

    return {
      totalSpend: spendSum,
      totalLeads: leadsSum,
      avgCPL: cplAvg,
      overallCTR: ctrAvg,
      totalPurchases: purchaseSum,
      totalPurchaseValue: purchaseValSum,
      avgROAS: roasAvg,
      records: searchFiltered
    };
  }, [selectedClient, allClientRecords, selectedCountry, campaignSearch]);

  // Construct comparison ranges list
  interface ActiveRange {
    id: 'range1' | 'range2' | 'range3';
    label: string;
    start: string;
    end: string;
    colorClass: string;
    colorHex: string;
    stats: ReturnType<typeof getAggregatedDataForRange>;
  }

  const getActiveRanges = (): ActiveRange[] => {
    const active: ActiveRange[] = [];

    if (!useCompareMode) {
      if (useCustomSingleDate) {
        if (singleCustomStart && singleCustomEnd) {
          active.push({
            id: 'range1',
            label: `${singleCustomStart} to ${singleCustomEnd}`,
            start: singleCustomStart,
            end: singleCustomEnd,
            colorClass: 'blue',
            colorHex: '#3b82f6',
            stats: getAggregatedDataForRange(singleCustomStart, singleCustomEnd)
          });
        }
      } else {
        const currentBatch = batches.find(b => b.label === selectedBatchLabel);
        if (currentBatch) {
          active.push({
            id: 'range1',
            label: currentBatch.label,
            start: currentBatch.start,
            end: currentBatch.end,
            colorClass: 'blue',
            colorHex: '#3b82f6',
            stats: getAggregatedDataForRange(currentBatch.start, currentBatch.end)
          });
        }
      }
    } else {
      if (range1Start && range1End) {
        active.push({
          id: 'range1',
          label: range1Label || `${range1Start} to ${range1End}`,
          start: range1Start,
          end: range1End,
          colorClass: 'blue',
          colorHex: '#3b82f6',
          stats: getAggregatedDataForRange(range1Start, range1End)
        });
      }
      if (range2Start && range2End) {
        active.push({
          id: 'range2',
          label: range2Label || `${range2Start} to ${range2End}`,
          start: range2Start,
          end: range2End,
          colorClass: 'violet',
          colorHex: '#a78bfa',
          stats: getAggregatedDataForRange(range2Start, range2End)
        });
      }
      if (enableRange3 && range3Start && range3End) {
        active.push({
          id: 'range3',
          label: range3Label || `${range3Start} to ${range3End}`,
          start: range3Start,
          end: range3End,
          colorClass: 'emerald',
          colorHex: '#10b981',
          stats: getAggregatedDataForRange(range3Start, range3End)
        });
      }
    }
    return active;
  };

  const activeRanges = getActiveRanges();

  // Combined sorted records for comparing Campaign metrics line-by-line
  const getCombinedSortedRecords = () => {
    const combined: { record: CampaignRecord; rangeId: string; rangeLabel: string; rangeColorClass: string }[] = [];
    
    activeRanges.forEach(range => {
      range.stats.records.forEach(r => {
        combined.push({
          record: r,
          rangeId: range.id,
          rangeLabel: range.label,
          rangeColorClass: range.colorClass
        });
      });
    });

    return combined.sort((a, b) => {
      const aVal = a.record[sortField as keyof CampaignRecord] ?? 0;
      const bVal = b.record[sortField as keyof CampaignRecord] ?? 0;
      
      if (aVal === bVal) {
        return a.record.campaignName.localeCompare(b.record.campaignName);
      }

      if (typeof aVal === 'string') {
        const bStr = bVal as string;
        return sortAsc ? aVal.localeCompare(bStr) : bStr.localeCompare(aVal);
      }
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  };

  // Check if E-Commerce metrics are active for the records
  const hasEcommerceData = activeRanges.some(r => r.stats.totalPurchases > 0 || r.stats.totalPurchaseValue > 0);

  // Sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Dynamic Chart.js configuration
  const getCampaignComparisonChart = () => {
    const campaignNamesSet = new Set<string>();
    activeRanges.forEach(range => {
      range.stats.records.forEach(r => {
        campaignNamesSet.add(r.campaignName);
      });
    });

    const uniqueCampaigns = Array.from(campaignNamesSet).slice(0, 8); // Top 8 to avoid clutter

    return {
      labels: uniqueCampaigns.map(name => name.length > 20 ? name.substring(0, 20) + '...' : name),
      datasets: activeRanges.map(range => {
        return {
          label: range.label,
          data: uniqueCampaigns.map(name => {
            const record = range.stats.records.find(r => r.campaignName === name);
            if (chartMetric === 'amountSpent') return record ? record.amountSpent : 0;
            if (chartMetric === 'leads') return record ? record.leads : 0;
            if (chartMetric === 'purchases') return record ? (record.purchases || 0) : 0;
            if (chartMetric === 'roas') return record ? (record.roas || 0) : 0;
            return record ? record.costPerLead : 0;
          }),
          backgroundColor: range.colorHex + 'bb',
          borderColor: range.colorHex,
          borderWidth: 2,
          borderRadius: 4
        };
      })
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#e2e8f0', font: { family: 'Plus Jakarta Sans' } }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: '#121218',
        titleColor: '#94a3b8',
        bodyColor: '#f1f5f9',
        borderColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1
      }
    },
    scales: {
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.03)' },
        ticks: { color: '#94a3b8' }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8' }
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-[#050505] font-sans">
      {/* Background Ambient Glow Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none animate-glow-slow"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-violet-500/5 blur-[120px] pointer-events-none animate-glow-slow delay-2000"></div>

      {/* Header bar */}
      <header className="border-b border-[var(--border-color)] bg-[#09090c] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-tr from-blue-500 to-violet-500 flex items-center justify-center shadow-lg shadow-violet-500/10">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              Multi-Client CSV Analytics
              <span className="text-xs bg-violet-500/10 text-violet-400 font-semibold px-2 py-0.5 rounded-full border border-violet-500/20">
                Sandbox Mode
              </span>
            </h1>
            <p className="text-xs text-[var(--text-muted)]">Local-first IndexedDB storage</p>
          </div>
        </div>

        {/* Client Selector & Tools */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-violet-400" />
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Client:</span>
            {clients.length > 0 ? (
              <select
                className="form-control text-sm font-semibold bg-[#121218] border border-[var(--border-color)] rounded-md px-3 py-1.5 focus:border-violet-500 outline-none"
                value={selectedClient}
                onChange={(e) => {
                  setSelectedClient(e.target.value);
                  setSelectedCountry('ALL');
                }}
              >
                {clients.map(client => (
                  <option key={client} value={client}>{client}</option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-amber-400 italic">No Client Data. Sync Sheets or Upload CSV below.</span>
            )}
          </div>

          {selectedClient && (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
                title="Google Sheet Integration Settings"
              >
                <Settings className="h-4 w-4 text-[var(--text-muted)]" />
                Configure Sheet
              </button>
              <button 
                onClick={handleClearClientData}
                className="btn-secondary border-red-500/20 text-red-300 hover:bg-red-950/20 text-xs px-3 py-1.5 flex items-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                Prune Data
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Area */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full flex flex-col gap-6">
        
        {/* Google Sheet Sync & Upload Panel */}
        <section className="glass-panel p-6 bg-gradient-primary flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-400" />
                Data Ingredients Station
              </h2>
              <p className="text-xs text-[var(--text-muted)]">Import raw CSV files or sync directly from client sheets.</p>
            </div>

            {selectedClient && (
              <button 
                onClick={handleSheetsSync}
                disabled={sheetSyncLoading}
                className="btn-primary text-xs flex items-center gap-2"
              >
                <RefreshCw className={`h-4.5 w-4.5 ${sheetSyncLoading ? 'animate-spin' : ''}`} />
                {sheetSyncLoading ? 'Syncing...' : 'Fetch from Google Sheets'}
              </button>
            )}
          </div>

          {/* Sync Configuration Box */}
          {showSettings && (
            <div className="p-4 bg-[#121218] border border-[var(--border-color)] rounded-xl flex flex-col gap-3 animate-fade-in">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-violet-400">Google Sheet Integration Settings</h3>
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Spreadsheet ID</label>
                  <input 
                    type="text" 
                    className="form-control text-xs" 
                    value={spreadsheetId}
                    onChange={(e) => setSpreadsheetId(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Connected Sheet Tab</label>
                  <input 
                    type="text" 
                    className="form-control text-xs font-semibold bg-[#1a1a24] text-[var(--text-muted)] cursor-not-allowed" 
                    value={selectedClient || 'Select a client'}
                    disabled
                  />
                </div>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] italic">
                Tip: Set spreadsheet share settings to "Anyone with link can view" to allow the dashboard to fetch data.
              </p>
            </div>
          )}

          {sheetSyncError && (
            <div className="p-3 bg-red-950/35 border border-red-500/20 text-red-300 text-xs rounded-lg animate-fade-in">
              <strong>Google Sheets Sync Error:</strong> {sheetSyncError}
            </div>
          )}

          {/* CSV File Upload Dropzone */}
          <div 
            className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-all ${
              dragActive ? 'border-blue-500 bg-blue-500/5' : 'border-[var(--border-color)] bg-[#0c0c12]'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="h-8 w-8 text-slate-500 mb-3" />
            <p className="text-sm text-slate-300 font-medium mb-1">
              Drag and drop your Meta Ads 30-Day performance CSV here
            </p>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Guards against duplicates automatically using date + campaign unique keys
            </p>
            <label className="btn-secondary text-xs cursor-pointer py-2 px-4">
              Browse Files
              <input 
                type="file" 
                accept=".csv" 
                className="hidden" 
                onChange={handleFileChange}
              />
            </label>
          </div>

          {uploadError && (
            <div className="p-3 bg-red-950/35 border border-red-500/20 text-red-300 text-xs rounded-lg animate-fade-in">
              <strong>Upload Error:</strong> {uploadError}
            </div>
          )}
          {uploadSuccess && (
            <div className="p-3 bg-emerald-950/35 border border-emerald-500/20 text-emerald-300 text-xs rounded-lg animate-fade-in">
              <strong>Success:</strong> {uploadSuccess}
            </div>
          )}

          {/* Pending Imports Buffer */}
          {pendingUploads.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending Imports ({pendingUploads.length})</h3>
              {pendingUploads.map((pending, idx) => (
                <div key={idx} className="p-4 bg-[#121218] border border-[var(--border-color)] rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-5 w-5 text-blue-400" />
                    <div>
                      <p className="text-xs font-semibold text-slate-200">{pending.fileName}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">Parsed Range: {pending.dateStarts} to {pending.dateEnds}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)]">Assign Client:</span>
                      <input 
                        type="text" 
                        className="form-control text-xs font-semibold uppercase py-1 px-2 w-28 bg-[#1a1a24] border border-[var(--border-color)] text-slate-100"
                        value={pending.clientName}
                        onChange={(e) => {
                          const updated = [...pendingUploads];
                          updated[idx].clientName = e.target.value.toUpperCase();
                          setPendingUploads(updated);
                        }}
                      />
                    </div>
                    <button 
                      className="btn-primary text-xs py-1.5 px-3 rounded-md"
                      onClick={() => commitUpload(idx)}
                    >
                      <Sparkles className="h-3 w-3" />
                      Save to Dashboard
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Dashboard Filters Row */}
        {selectedClient && (
          <>
            <section className="flex flex-col gap-4 bg-[#121218] border border-[var(--border-color)] p-4 rounded-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-6">
                  {/* Mode Selector */}
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-violet-400" />
                    <button 
                      onClick={() => setUseCompareMode(!useCompareMode)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                        useCompareMode 
                          ? 'bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-500/20' 
                          : 'bg-[#1a1a24] border-[var(--border-color)] text-[var(--text-muted)] hover:text-white'
                      }`}
                    >
                      {useCompareMode ? 'Compare Mode (Active)' : 'Enable Period Comparison'}
                    </button>
                  </div>

                  {/* Standard date selector if NOT in compare mode */}
                  {!useCompareMode && batches.length > 0 && (
                    <div className="flex items-center gap-3 animate-fade-in">
                      <Calendar className="h-4 w-4 text-blue-400" />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setUseCustomSingleDate(!useCustomSingleDate)}
                          className={`text-[10px] font-bold px-2 py-1 rounded transition ${
                            useCustomSingleDate
                              ? 'bg-blue-600/20 border border-blue-500 text-blue-300'
                              : 'bg-[#1a1a24] border border-white/5 text-[var(--text-muted)] hover:text-white'
                          }`}
                        >
                          {useCustomSingleDate ? 'Custom Dates' : 'Predefined Batch'}
                        </button>
                        
                        {!useCustomSingleDate ? (
                          <select 
                            className="form-control text-xs font-semibold bg-[#171722] border border-[var(--border-color)] rounded-md px-3 py-1.5 focus:border-blue-500 outline-none"
                            value={selectedBatchLabel}
                            onChange={(e) => setSelectedBatchLabel(e.target.value)}
                          >
                            {batches.map(batch => (
                              <option key={batch.label} value={batch.label}>{batch.label}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input 
                              type="date" 
                              className="form-control text-xs py-1 px-2 bg-[#171722] border-[var(--border-color)]"
                              value={singleCustomStart} 
                              onChange={(e) => setSingleCustomStart(e.target.value)}
                            />
                            <span className="text-[10px] text-[var(--text-muted)]">to</span>
                            <input 
                              type="date" 
                              className="form-control text-xs py-1.5 px-2 bg-[#171722] border-[var(--border-color)]"
                              value={singleCustomEnd} 
                              onChange={(e) => setSingleCustomEnd(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Country Filter */}
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-blue-400" />
                    <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Country:</span>
                    <select 
                      className="form-control text-xs font-semibold bg-[#171722] border border-[var(--border-color)] rounded-md px-3 py-1.5 focus:border-blue-500 outline-none"
                      value={selectedCountry}
                      onChange={(e) => setSelectedCountry(e.target.value)}
                    >
                      <option value="ALL">ALL COUNTRIES</option>
                      {countries.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <input
                    type="text"
                    placeholder="Search campaigns..."
                    className="form-control text-xs w-full md:w-48 bg-[#171722]"
                    value={campaignSearch}
                    onChange={(e) => setCampaignSearch(e.target.value)}
                  />
                  
                  <div className="text-[10px] text-[var(--text-muted)] font-medium bg-[#1a1a24] border border-[var(--border-color)] py-1.5 px-3 rounded-full flex items-center gap-1.5 shrink-0">
                    <Layers className="h-3.5 w-3.5 text-blue-400" />
                    Database Rows: {allClientRecords.length}
                  </div>
                </div>
              </div>

              {/* Compare Mode Setup Board */}
              {useCompareMode && (
                <div className="border-t border-white/5 pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
                  
                  {/* Period A */}
                  <div className="p-3 bg-[#171722]/50 border border-blue-500/20 rounded-xl flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#3b82f6]" />
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Period A (Target)</span>
                    </div>
                    <div className="flex items-center gap-1 w-full">
                      <input 
                        type="date" 
                        className="form-control text-xs py-1.5 px-2 w-1/2 bg-[#0c0c12]"
                        value={range1Start} 
                        onChange={(e) => setRange1Start(e.target.value)}
                      />
                      <span className="text-[10px] text-[var(--text-muted)]">to</span>
                      <input 
                        type="date" 
                        className="form-control text-xs py-1.5 px-2 w-1/2 bg-[#0c0c12]"
                        value={range1End} 
                        onChange={(e) => setRange1End(e.target.value)}
                      />
                    </div>
                    <input 
                      type="text" 
                      placeholder="Label (e.g. June Run)" 
                      className="form-control text-[10px] py-1 px-2 bg-[#0c0c12] border-white/5"
                      value={range1Label}
                      onChange={(e) => setRange1Label(e.target.value)}
                    />
                  </div>

                  {/* Period B */}
                  <div className="p-3 bg-[#171722]/50 border border-violet-500/20 rounded-xl flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#a78bfa]" />
                      <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Period B (Compare)</span>
                    </div>
                    <div className="flex items-center gap-1 w-full">
                      <input 
                        type="date" 
                        className="form-control text-xs py-1.5 px-2 w-1/2 bg-[#0c0c12]"
                        value={range2Start} 
                        onChange={(e) => setRange2Start(e.target.value)}
                      />
                      <span className="text-[10px] text-[var(--text-muted)]">to</span>
                      <input 
                        type="date" 
                        className="form-control text-xs py-1.5 px-2 w-1/2 bg-[#0c0c12]"
                        value={range2End} 
                        onChange={(e) => setRange2End(e.target.value)}
                      />
                    </div>
                    <input 
                      type="text" 
                      placeholder="Label (e.g. May Run)" 
                      className="form-control text-[10px] py-1 px-2 bg-[#0c0c12] border-white/5"
                      value={range2Label}
                      onChange={(e) => setRange2Label(e.target.value)}
                    />
                  </div>

                  {/* Period C */}
                  <div className={`p-3 border rounded-xl flex flex-col gap-2 transition ${
                    enableRange3 ? 'bg-[#171722]/50 border-emerald-500/20' : 'bg-[#171722]/10 border-white/5 opacity-60'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Period C</span>
                      </div>
                      <label className="text-[10px] text-slate-300 flex items-center gap-1 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={enableRange3} 
                          onChange={(e) => setEnableRange3(e.target.checked)} 
                          className="rounded"
                        />
                        Enable
                      </label>
                    </div>
                    
                    {enableRange3 && (
                      <>
                        <div className="flex items-center gap-1 w-full animate-fade-in">
                          <input 
                            type="date" 
                            className="form-control text-xs py-1.5 px-2 w-1/2 bg-[#0c0c12]"
                            value={range3Start} 
                            onChange={(e) => setRange3Start(e.target.value)}
                          />
                          <span className="text-[10px] text-[var(--text-muted)]">to</span>
                          <input 
                            type="date" 
                            className="form-control text-xs py-1.5 px-2 w-1/2 bg-[#0c0c12]"
                            value={range3End} 
                            onChange={(e) => setRange3End(e.target.value)}
                          />
                        </div>
                        <input 
                          type="text" 
                          placeholder="Label" 
                          className="form-control text-[10px] py-1 px-2 bg-[#0c0c12] border-white/5 animate-fade-in"
                          value={range3Label}
                          onChange={(e) => setRange3Label(e.target.value)}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Select KPIs to Display */}
              <div className="border-t border-white/5 pt-3 flex flex-wrap items-center gap-3">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">KPIs to Display (Max 3):</span>
                <div className="flex flex-wrap items-center gap-2">
                  {AVAILABLE_KPIS.map(kpi => {
                    const isSelected = selectedKPIs.includes(kpi.id);
                    return (
                      <button
                        key={kpi.id}
                        onClick={() => {
                          if (isSelected) {
                            if (selectedKPIs.length > 1) {
                              setSelectedKPIs(prev => prev.filter(id => id !== kpi.id));
                            }
                          } else {
                            if (selectedKPIs.length < 3) {
                              setSelectedKPIs(prev => [...prev, kpi.id]);
                            } else {
                              setSelectedKPIs(prev => [...prev.slice(1), kpi.id]);
                            }
                          }
                        }}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition ${
                          isSelected
                            ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                            : 'bg-[#171722] border-white/5 text-[var(--text-muted)] hover:text-slate-200'
                        }`}
                      >
                        {kpi.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* KPI Metrics Cards */}
            {activeRanges.length > 0 ? (
              <section className="dashboard-grid animate-fade-in">
                {selectedKPIs.map(kpiId => {
                  const kpiInfo = AVAILABLE_KPIS.find(k => k.id === kpiId);
                  if (!kpiInfo) return null;
                  return (
                    <div key={kpiId} className="glass-panel p-5 bg-[#121218] flex flex-col gap-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        {kpiInfo.label}
                      </span>
                      <div className="flex flex-col gap-2">
                        {activeRanges.map(range => {
                          const kpiVal = getKPIValue(range.stats, kpiId);
                          return (
                            <div key={range.id} className="flex items-center justify-between border-b border-white/5 pb-1.5 last:border-0 last:pb-0">
                              <span className={`text-[10px] font-bold uppercase tracking-wider text-${range.colorClass}-400 flex items-center gap-1.5`}>
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: range.colorHex }} />
                                {range.label}
                              </span>
                              <span className={`text-base font-bold ${kpiId === 'roas' || kpiId === 'ctr' ? 'text-emerald-400' : 'text-slate-100'}`}>
                                {kpiInfo.format(kpiVal)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </section>
            ) : (
              <div className="p-6 text-center text-xs text-amber-400 bg-amber-950/20 border border-amber-500/20 rounded-xl">
                Please select valid date ranges or timelines to fetch records.
              </div>
            )}

            {/* Campaign Comparison Chart */}
            {activeRanges.length > 0 && (
              <section className="glass-panel p-6 bg-[#121218] flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-violet-400" />
                    Campaign Comparison Trends
                  </h3>
                  <div className="flex gap-2">
                    {(['amountSpent', 'leads', 'costPerLead', 'purchases', 'roas'] as const).map(metric => {
                      if ((metric === 'purchases' || metric === 'roas') && !hasEcommerceData) return null;
                      return (
                        <button
                          key={metric}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-md border transition ${
                            chartMetric === metric
                              ? 'bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-500/20'
                              : 'bg-[#171722] border-[var(--border-color)] text-[var(--text-muted)] hover:text-slate-100'
                          }`}
                          onClick={() => setChartMetric(metric)}
                        >
                          {metric === 'amountSpent' ? 'Spend' : metric === 'leads' ? 'Leads' : metric === 'costPerLead' ? 'CPL' : metric === 'purchases' ? 'Purchases' : 'ROAS'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="h-72 w-full relative">
                  <Bar data={getCampaignComparisonChart()} options={chartOptions} />
                </div>
              </section>
            )}

            {/* Detailed Campaigns Performance Table */}
            <section className="glass-panel bg-[#121218] overflow-hidden flex flex-col animate-fade-in">
              <div className="p-6 border-b border-[var(--border-color)] flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-400" />
                  Detailed Campaign Performance Ledger
                </h3>
              </div>

              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse text-xs text-slate-300">
                  <thead>
                    <tr className="bg-[#171722] text-[var(--text-muted)] uppercase tracking-wider font-semibold border-b border-[var(--border-color)]">
                      <th className="py-3 px-4 cursor-pointer hover:text-slate-200" onClick={() => handleSort('campaignName')}>Campaign Name</th>
                      {useCompareMode && <th className="py-3 px-4 text-center">Period</th>}
                      <th className="py-3 px-4 cursor-pointer hover:text-slate-200" onClick={() => handleSort('adSetName')}>Ad Set Name</th>
                      <th className="py-3 px-4 cursor-pointer hover:text-slate-200 text-center" onClick={() => handleSort('country')}>Country</th>
                      <th className="py-3 px-4 cursor-pointer hover:text-slate-200 text-right" onClick={() => handleSort('leads')}>Leads</th>
                      <th className="py-3 px-4 cursor-pointer hover:text-slate-200 text-right" onClick={() => handleSort('costPerLead')}>CPL (INR)</th>
                      <th className="py-3 px-4 cursor-pointer hover:text-slate-200 text-right" onClick={() => handleSort('amountSpent')}>Spend (INR)</th>
                      <th className="py-3 px-4 cursor-pointer hover:text-slate-200 text-right" onClick={() => handleSort('ctr')}>CTR</th>
                      {hasEcommerceData && (
                        <>
                          <th className="py-3 px-4 cursor-pointer hover:text-slate-200 text-right" onClick={() => handleSort('purchases')}>Purchases</th>
                          <th className="py-3 px-4 cursor-pointer hover:text-slate-200 text-right" onClick={() => handleSort('roas')}>ROAS</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {getCombinedSortedRecords().map((rowItem, idx) => {
                      const row = rowItem.record;
                      return (
                        <tr 
                          key={idx} 
                          className={`border-b border-[var(--border-color)] transition-colors hover:bg-white/5 ${
                            useCompareMode 
                              ? rowItem.rangeId === 'range1' 
                                ? 'bg-blue-500/[0.02]' 
                                : rowItem.rangeId === 'range2' 
                                  ? 'bg-violet-500/[0.02]' 
                                  : 'bg-emerald-500/[0.02]' 
                              : ''
                          }`}
                        >
                          <td className="py-3 px-4 font-medium text-slate-200 max-w-[200px] truncate" title={row.campaignName}>
                            {row.campaignName}
                          </td>
                          {useCompareMode && (
                            <td className="py-3 px-4 text-center shrink-0">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider bg-[#0c0c12] text-${rowItem.rangeColorClass}-400 border-${rowItem.rangeColorClass}-500/30`}>
                                {rowItem.rangeLabel}
                              </span>
                            </td>
                          )}
                          <td className="py-3 px-4 text-[var(--text-muted)] max-w-[200px] truncate" title={row.adSetName}>
                            {row.adSetName}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="bg-[#1a1a24]/80 px-2 py-1 rounded text-[10px] font-bold border border-[var(--border-color)]">
                              {row.country}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-emerald-400">{row.leads.toLocaleString()}</td>
                          <td className="py-3 px-4 text-right font-medium">₹{row.costPerLead.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right font-semibold text-slate-100">₹{row.amountSpent.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                          <td className="py-3 px-4 text-right font-semibold text-violet-400">{row.ctr.toFixed(2)}%</td>
                          {hasEcommerceData && (
                            <>
                              <td className="py-3 px-4 text-right font-semibold text-slate-100">{(row.purchases || 0).toLocaleString()}</td>
                              <td className="py-3 px-4 text-right font-bold text-emerald-400">{(row.roas || 0).toFixed(2)}x</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {!selectedClient && (
          <section className="glass-panel p-8 text-center bg-[#121218] flex flex-col items-center gap-4 py-16 animate-fade-in">
            <div className="h-16 w-16 bg-[#1a1a24] border border-[var(--border-color)] rounded-2xl flex items-center justify-center mb-2 shadow-inner">
              <TrendingUp className="h-8 w-8 text-slate-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-200">No Analytics Data Loaded</h3>
              <p className="text-xs text-[var(--text-muted)] max-w-sm mt-1 mx-auto">
                Sync with your Google Sheet tab or upload your Meta Ads CSV report above to start analyzing.
              </p>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-[var(--border-color)] bg-[#09090c] py-4 px-6 text-center text-[10px] text-[var(--text-muted)] mt-12 flex flex-col md:flex-row items-center justify-between gap-2">
        <p>© 2026 Sandbox App System. Zero-cost browser storage model.</p>
        <p className="flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 text-violet-400" />
          IndexedDB Status: <span className="text-emerald-400 font-bold">Synchronized</span>
        </p>
      </footer>
    </div>
  );
}
