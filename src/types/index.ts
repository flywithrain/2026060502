// ====== 订单字段类型 ======
export interface OrderRow {
  id: string;
  rowIndex: number;
  externalCode: string;
  storeName: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  skuCode: string;
  skuName: string;
  skuQuantity: number;
  skuSpec: string;
  remark: string;
  _errors?: ValidationError[];
}

// ====== 校验错误类型 ======
export interface ValidationError {
  rowIndex: number;
  field: string;
  message: string;
}

// ====== 规则引擎类型 ======
export type FileType = 'excel' | 'pdf';
export type ParseMode = 'standard' | 'aggregate' | 'matrix' | 'card' | 'multi-sheet';

export interface FieldMapping {
  fromCol: number;
  fromColName?: string;
  toField: keyof Omit<OrderRow, 'id' | 'rowIndex' | '_errors'>;
  aiConfidence?: 'high' | 'medium' | 'low';
}

export interface ExcelConfig {
  sheetNames?: string[];
  headerRows: number;
  footerRows: number;
  dataStartRow: number;
  skipRows?: number[];
  skipIfFirstColContains?: string[];
  endMarker?: { col: number; val: string };
}

export interface PdfConfig {
  tableStartMarker: string;
  tableEndMarker: string;
  footerStartMarker: string;
}

export interface AggregateConfig {
  groupByCol: number;
  groupByField: keyof Omit<OrderRow, 'id' | 'rowIndex' | '_errors'>;
  sharedFields: (keyof Omit<OrderRow, 'id' | 'rowIndex' | '_errors'>)[];
}

export interface MatrixConfig {
  storeHeaderRow: number;
  storeStartCol: number;
  storeEndCol: number;
  fixedColMappings: FieldMapping[];
  valueColOffset?: number;
}

export interface CardConfig {
  boundaryPattern: string;
  boundaryCol?: number;
  headerRowMappings: {
    rowOffset: number;
    mappings: FieldMapping[];
  }[];
  dataHeaderRowOffset: number;
  dataFieldMappings: FieldMapping[];
}

export interface FooterExtractItem {
  rowOffset: number;
  mappings: FieldMapping[];
}

export interface FooterExtractConfig {
  extractFromEnd?: boolean;
  rowMappings: FooterExtractItem[];
}

export interface ParseRule {
  id: string;
  name: string;
  description: string;
  fileType: FileType;
  parseMode: ParseMode;
  excel?: ExcelConfig;
  pdf?: PdfConfig;
  fieldMappings: FieldMapping[];
  aggregate?: AggregateConfig;
  matrix?: MatrixConfig;
  card?: CardConfig;
  footerExtract?: FooterExtractConfig;
  defaults?: Partial<Record<keyof Omit<OrderRow, 'id' | 'rowIndex' | '_errors'>, string>>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ParseRuleDraft extends Omit<ParseRule, 'id' | 'createdAt' | 'updatedAt'> {
  id?: string;
}

// ====== AI 规则生成 ======
export interface AiRuleResponse {
  rule: ParseRuleDraft;
  suggestions: string;
  confidenceSummary: {
    high: number;
    medium: number;
    low: number;
  };
}

// ====== 文件解析 ======
export interface ParseProgress {
  current: number;
  total: number;
  percent: number;
  status: 'idle' | 'parsing' | 'done' | 'error';
}

export interface ParseResult {
  rows: OrderRow[];
  errors: ValidationError[];
  fileName: string;
  ruleName: string;
  parseDuration: number;
}

// ====== 提交结果 ======
export interface SubmitResult {
  success: number;
  failed: number;
  batchId: string;
  errors?: { rowIndex: number; message: string }[];
}

// ====== 数据库记录 ======
export interface DbOrder {
  id: string;
  externalCode: string;
  storeName: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  skuCode: string;
  skuName: string;
  skuQuantity: number;
  skuSpec: string;
  remark: string;
  batchId: string;
  submittedAt: string;
}

// ====== 文件读取 ======
export interface RawRow {
  rowNum: number;
  cells: (string | number | null)[];
}

export interface ParsedFile {
  fileName: string;
  fileType: FileType;
  sheets?: { name: string; rows: RawRow[] }[];
  rows: RawRow[];
  sampleText?: string;
}

// ====== UI 状态 ======
export type ImportStep = 'upload' | 'select-rule' | 'ai-generate' | 'preview' | 'submit';
