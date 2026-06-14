export interface InvoiceItem {
  desc: string;
  qtd: number;
  preco: number;
  total: number;
  custo?: number;
}

export interface CustomField {
  key: string;
  value: string;
}

export interface HistoryRecord {
  id: string;
  date: string;
  num: string;
  type: string;
  client: string;
  total: number;
  subtotal?: number;
  taxAmount?: number;
  taxRate?: number;
  discountAmount?: number;
  discountRate?: number;
  items: InvoiceItem[];
  customFields?: CustomField[];
  dueDate?: string;
  status?: 'Pago' | 'Pendente' | 'Vencido' | 'Anulado';
}

export interface CompanyData {
  nome: string;
  sigla: string;
  nif: string;
  end: string;
  tel: string;
  pais: string;
  cidade: string;
  email: string;
  logo: string | null;
  banco?: string;
  iban?: string;
}
