import React, { useState, useEffect, useRef, ChangeEvent, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRious from 'qrious';
import html2canvas from 'html2canvas';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { 
  FileText, 
  Building2, 
  User, 
  ShoppingCart, 
  Plus, 
  Trash2, 
  Eye, 
  Crown, 
  X, 
  Printer, 
  Download,
  AlertCircle,
  Image as ImageIcon,
  Search,
  Settings,
  Copy,
  Facebook,
  Instagram,
  Youtube as YoutubeIcon,
  Linkedin,
  MessageCircle,
  ArrowRight,
  Cloud,
  RefreshCw,
  MoreVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { auth } from './lib/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { subscribeToInvoices, saveInvoiceToFirebase, removeInvoiceFromFirebase, ensureUserDoc } from './lib/invoiceService';

import { supabase } from './lib/supabase';
import { saveInvoiceToSupabase, deleteInvoiceFromSupabase, fetchInvoicesFromSupabase, saveCustomerToSupabase, saveProductToSupabase } from './lib/supabaseService';
import AuthModal from './components/AuthModal';
import { User as SupabaseUser } from '@supabase/supabase-js';

import { InvoiceItem, HistoryRecord, CompanyData, CustomField } from './types';
import { exportHistoryAsJSON, uploadBackupToSupabase } from './lib/backupService';
import { requestNotificationPermission, showNotification, checkOverdueInvoices } from './lib/notifications';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: {
      finalY: number;
    };
  }
}

export default function App() {
  // Persistence Keys
  const SOBA_KEY = 'f90_isSoba';
  const DB_KEY = 'f90_SobaDB';
  const ITEMS_KEY = 'f90_items';
  const HISTORY_KEY = 'f90_history';
  const QR_CONFIG_KEY = 'f90_qrConfig';
  const THERMAL_CONFIG_KEY = 'f90_thermalConfig';
  const BACKUP_CONFIG_KEY = 'f90_autoBackup';

  // State
  const [isSoba, setIsSoba] = useState(false);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [showSupabaseAuth, setShowSupabaseAuth] = useState(false);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [isTaxEnabled, setIsTaxEnabled] = useState<boolean>(false);
  const [discountRate, setDiscountRate] = useState<number>(0);
  const [currency, setCurrency] = useState<string>('Kz');
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [depositStatus, setDepositStatus] = useState<'idle' | 'processing' | 'done'>('idle');
  const [showCustomerManager, setShowCustomerManager] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');

  // Access Levels: 'free' | 'donor' | 'soba'
  const [userLevel, setUserLevel] = useState<'free' | 'donor' | 'soba'>('free');
  const [dailyGeneratedCount, setDailyGeneratedCount] = useState(0);
  const [pdfTemplate, setPdfTemplate] = useState<'MODERN' | 'MINIMALIST' | 'CLASSIC'>('MODERN');
  const [isAuthScreen, setIsAuthScreen] = useState(false);
  const [adminAnnouncement, setAdminAnnouncement] = useState('');
  const [autoBackupCloud, setAutoBackupCloud] = useState(false);
  const [isBackupProcessing, setIsBackupProcessing] = useState(false);
  const [showBackupMenu, setShowBackupMenu] = useState(false);

  // NIF Validation helper
  const isNifValid = (nif: string) => {
    if (!nif) return true; // Don't show error if empty
    return nif.length >= 9 && nif.length <= 14; 
  };

  // QR Configuration State
  const [showQRDebug, setShowQRDebug] = useState(false);
  const [thermalSettingsOpen, setThermalSettingsOpen] = useState(false);
  const [qrConfig, setQrConfig] = useState({
    includeApp: true,
    includeDocType: true,
    includeId: true,
    includeNif: true,
    includeClient: true,
    includeValue: true,
    includeDate: true,
    includeWeb: true
  });

  // Thermal Print Config
  const [thermalConfig, setThermalConfig] = useState({
    pt: 40,
    pb: 40,
    px: 40,
    width: 78,
    qrPadding: 10
  });
  
  // Invoice Details
  const [docTipo, setDocTipo] = useState('FACTURA / RECIBO');
  const [docNum, setDocNum] = useState('FR 2026/001');
  const [docData, setDocData] = useState(new Date().toISOString().split('T')[0]);
  const [docDueDate, setDocDueDate] = useState('');
  const [docStatus, setDocStatus] = useState<'Pago' | 'Pendente' | 'Vencido' | 'Anulado'>('Pendente');
  const [wmCheck, setWmCheck] = useState(true);
  const [wmText, setWmText] = useState('ORIGINAL');

  // Company Details
  const [company, setCompany] = useState<CompanyData>({
    nome: '',
    sigla: '',
    nif: '',
    end: '',
    tel: '',
    pais: 'Angola',
    cidade: 'Luanda',
    email: '',
    logo: null,
    banco: '',
    iban: ''
  });

  const countryDataList = [
    { name: 'Angola', capital: 'Luanda', flag: '🇦🇴', currency: 'Kz' },
    { name: 'Moçambique', capital: 'Maputo', flag: '🇲🇿', currency: 'MT' },
    { name: 'Portugal', capital: 'Lisboa', flag: '🇵🇹', currency: '€' },
    { name: 'Brasil', capital: 'Brasília', flag: '🇧🇷', currency: 'R$' },
    { name: 'Cabo Verde', capital: 'Praia', flag: '🇨🇻', currency: 'CVE' },
    { name: 'Guiné-Bissau', capital: 'Bissau', flag: '🇬🇼', currency: 'CFA' },
    { name: 'São Tomé e Príncipe', capital: 'São Tomé', flag: '🇸🇹', currency: 'Db' },
    { name: 'Timor-Leste', capital: 'Díli', flag: '🇹🇱', currency: '$' },
    { name: 'Estados Unidos', capital: 'Washington, D.C.', flag: '🇺🇸', currency: '$' },
    { name: 'Espanha', capital: 'Madrid', flag: '🇪🇸', currency: '€' },
    { name: 'França', capital: 'Paris', flag: '🇫🇷', currency: '€' },
    { name: 'Alemanha', capital: 'Berlim', flag: '🇩🇪', currency: '€' },
    { name: 'Reino Unido', capital: 'Londres', flag: '🇬🇧', currency: '£' },
    { name: 'África do Sul', capital: 'Pretória', flag: '🇿🇦', currency: 'R' },
    { name: 'China', capital: 'Pequim', flag: '🇨🇳', currency: '¥' },
    { name: 'Japão', capital: 'Tóquio', flag: '🇯🇵', currency: '¥' }
  ];

  const commonCities = [
    'Luanda', 'Benguela', 'Huambo', 'Lobito', 'Lubango', 'Namibe', 'Malanje', 'Cabinda', 'Soyó', 'Uíge',
    'Maputo', 'Matola', 'Beira', 'Nampula', 'Quelimane', 'Tete', 'Pemba',
    'Lisboa', 'Porto', 'Coimbra', 'Braga', 'Faro', 'Funchal', 'Setúbal', 'Viseu',
    'São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'Fortaleza', 'Belo Horizonte', 'Manaus', 'Curitiba', 'Porto Alegre', 'Recife'
  ];

  const handleCountryChange = (val: string) => {
    const countryInfo = countryDataList.find(c => c.name.toLowerCase() === val.toLowerCase());
    if (countryInfo) {
      setCompany({ ...company, pais: countryInfo.name, cidade: countryInfo.capital });
      setCurrency(countryInfo.currency);
    } else {
      setCompany({ ...company, pais: val });
    }
  };

  // Client Details
  const [cliNome, setCliNome] = useState('Consumidor Final');
  const [cliNif, setCliNif] = useState('999999999');
  const [cliEmail, setCliEmail] = useState('');

  // Product Inputs
  const [prodDesc, setProdDesc] = useState('');
  const [prodQtd, setProdQtd] = useState<number | ''>('');
  const [prodPreco, setProdPreco] = useState<number | ''>('');

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Load Data
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        ensureUserDoc();
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!supabase || typeof supabase.auth?.onAuthStateChange !== 'function') return;
    
    supabase.auth.getSession().then(({ data }) => {
      setSupabaseUser(data?.session?.user ?? null);
    }).catch(err => console.error('Supabase session error:', err));

    const { data: authData } = supabase.auth.onAuthStateChange((_event, session) => {
      setSupabaseUser(session?.user ?? null);
    });

    return () => {
      authData?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function syncSupabase() {
      if (supabaseUser) {
        const invs = await fetchInvoicesFromSupabase();
        if (invs.length > 0) setHistory(invs);
      }
    }
    syncSupabase();
  }, [supabaseUser]);

  useEffect(() => {
    let unsub = () => {};
    if (user) {
      unsub = subscribeToInvoices((invoices) => {
        setHistory(invoices);
      });
    }
    return unsub;
  }, [user]);

  useEffect(() => {
    const savedSoba = localStorage.getItem(SOBA_KEY) === 'true';
    setIsSoba(savedSoba);

    const savedDB = localStorage.getItem(DB_KEY);
    if (savedDB) {
      setCompany(JSON.parse(savedDB));
    }

    const savedItems = localStorage.getItem(ITEMS_KEY);
    if (savedItems) {
      setItems(JSON.parse(savedItems));
    }

    const savedCliNome = localStorage.getItem('f90_cliNome');
    const savedCliNif = localStorage.getItem('f90_cliNif');
    const savedCliEmail = localStorage.getItem('f90_cliEmail');
    if (savedCliNome) setCliNome(savedCliNome);
    if (savedCliNif) setCliNif(savedCliNif);
    if (savedCliEmail) setCliEmail(savedCliEmail);

    const savedHistory = localStorage.getItem(HISTORY_KEY);
    if (!user && !supabaseUser && savedHistory) setHistory(JSON.parse(savedHistory));

    const savedQrConfig = localStorage.getItem(QR_CONFIG_KEY);
    if (savedQrConfig) setQrConfig(JSON.parse(savedQrConfig));

    const savedThermalConfig = localStorage.getItem(THERMAL_CONFIG_KEY);
    if (savedThermalConfig) setThermalConfig(JSON.parse(savedThermalConfig));

    const savedCustomFields = localStorage.getItem('f90_customFields');
    if (savedCustomFields) setCustomFields(JSON.parse(savedCustomFields));

    const savedTaxRate = localStorage.getItem('f90_taxRate');
    if (savedTaxRate) setTaxRate(Number(savedTaxRate));

    const savedIsTaxEnabled = localStorage.getItem('f90_isTaxEnabled');
    if (savedIsTaxEnabled) setIsTaxEnabled(savedIsTaxEnabled === 'true');

    const savedDiscountRate = localStorage.getItem('f90_discountRate');
    if (savedDiscountRate) setDiscountRate(Number(savedDiscountRate));

    const savedCurrency = localStorage.getItem('f90_currency');
    if (savedCurrency) setCurrency(savedCurrency as any);

    const savedTemplate = localStorage.getItem('f90_pdfTemplate');
    if (savedTemplate) setPdfTemplate(savedTemplate as any);

    const savedAnnouncement = localStorage.getItem('f90_adminAnnouncement');
    if (savedAnnouncement) setAdminAnnouncement(savedAnnouncement);

    const savedAutoBackup = localStorage.getItem(BACKUP_CONFIG_KEY) === 'true';
    setAutoBackupCloud(savedAutoBackup);

    // Load Daily Limit Data
    const today = new Date().toDateString();
    const lastDate = localStorage.getItem('f90_lastGenDate');
    const savedCount = localStorage.getItem('f90_dailyCount');
    
    if (lastDate === today) {
      if (savedCount) setDailyGeneratedCount(Number(savedCount));
    } else {
      localStorage.setItem('f90_lastGenDate', today);
      localStorage.setItem('f90_dailyCount', '0');
      setDailyGeneratedCount(0);
    }

    // Load User level (simulate soba if firebase user is logged in for now, or use local storage)
    const savedLevel = localStorage.getItem('f90_userLevel');
    if (savedLevel) setUserLevel(savedLevel as any);
  }, []);

  useEffect(() => {
    // Sync level with soba status
    if (isSoba) {
      setUserLevel('soba');
    }
  }, [isSoba]);

  useEffect(() => {
    localStorage.setItem('f90_userLevel', userLevel);
  }, [userLevel]);

  const incrementDailyCount = () => {
    const newCount = dailyGeneratedCount + 1;
    setDailyGeneratedCount(newCount);
    localStorage.setItem('f90_dailyCount', newCount.toString());
  };

  const checkLimit = () => {
    if (userLevel === 'soba') return true;
    const limit = userLevel === 'donor' ? 10 : 2;
    if (dailyGeneratedCount >= limit) {
      alert(`Limite diário atingido (${dailyGeneratedCount}/${limit}). Faça upgrade para continuar a facturar!`);
      setShowPremiumModal(true);
      return false;
    }
    return true;
  };

  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Save Data
  useEffect(() => {
    if (isSoba) {
      localStorage.setItem(DB_KEY, JSON.stringify(company));
    }
    // Items are always saved for offline persistence
    localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
    localStorage.setItem('f90_cliNome', cliNome);
    localStorage.setItem('f90_cliNif', cliNif);
    localStorage.setItem('f90_cliEmail', cliEmail);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    localStorage.setItem(QR_CONFIG_KEY, JSON.stringify(qrConfig));
    localStorage.setItem(THERMAL_CONFIG_KEY, JSON.stringify(thermalConfig));
    localStorage.setItem('f90_customFields', JSON.stringify(customFields));
    localStorage.setItem('f90_taxRate', taxRate.toString());
    localStorage.setItem('f90_isTaxEnabled', isTaxEnabled.toString());
    localStorage.setItem('f90_discountRate', discountRate.toString());
    localStorage.setItem('f90_currency', currency);
    localStorage.setItem('f90_pdfTemplate', pdfTemplate);
    localStorage.setItem(BACKUP_CONFIG_KEY, autoBackupCloud.toString());

    setLastSaved(new Date().toLocaleTimeString());
  }, [company, isSoba, items, cliNome, cliNif, cliEmail, history, qrConfig, thermalConfig, customFields, taxRate, isTaxEnabled, discountRate, currency, pdfTemplate, autoBackupCloud]);

  // Handle Push Notifications and Overdue Check
  useEffect(() => {
    // Request permission on app load
    requestNotificationPermission();

    // Check overdue invoices if we have history
    if (history && history.length > 0) {
       checkOverdueInvoices(history);
    }
  }, [history]);

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error('Login error', err);
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Logout error', err);
    }
  };

  const handleManualBackup = async () => {
    if (!supabaseUser) {
      setShowSupabaseAuth(true);
      return;
    }
    setIsBackupProcessing(true);
    try {
      await uploadBackupToSupabase(history, supabaseUser.id);
      alert('Backup realizado com sucesso no Supabase Storage!');
    } catch (err) {
      alert('Falha ao realizar backup. Verifique a sua conexão.');
    } finally {
      setIsBackupProcessing(false);
      setShowBackupMenu(false);
    }
  };

  const handleSobaLogin = () => {
    if (password === '90soba') {
      setIsSoba(true);
      localStorage.setItem(SOBA_KEY, 'true');
      setShowLogin(false);
      setPassword('');
    } else {
      alert('Código incorreto.');
    }
  };

  const handleLogout = () => {
    setIsSoba(false);
    localStorage.removeItem(SOBA_KEY);
  };

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (!isSoba) return;
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCompany(prev => ({ ...prev, logo: event.target?.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const addItem = () => {
    if (prodDesc && Number(prodQtd) > 0 && Number(prodPreco) >= 0) {
      const newItem: InvoiceItem = {
        desc: prodDesc,
        qtd: Number(prodQtd),
        preco: Number(prodPreco),
        total: Number(prodQtd) * Number(prodPreco)
      };

      if (supabaseUser) {
        saveProductToSupabase({ name: prodDesc, price: Number(prodPreco) });
      }

      setItems([...items, newItem]);
      setProdDesc('');
      setProdQtd('');
      setProdPreco('');
    } else {
      alert('Preencha os campos do produto corretamente.');
    }
  };

  const clearItems = () => setItems([]);

  const subtotal = items.reduce((acc, item) => acc + item.total, 0);
  const discountAmount = subtotal * (discountRate / 100);
  const valueAfterDiscount = subtotal - discountAmount;
  const taxAmount = isTaxEnabled ? valueAfterDiscount * (taxRate / 100) : 0;
  const total = valueAfterDiscount + taxAmount;
  
  const formatCurrency = (val: number) => {
    // Basic locales mapping
    const locales: Record<string, string> = {
      'Kz': 'pt-AO',
      '$': 'en-US',
      '€': 'de-DE',
      'R$': 'pt-BR',
      'MT': 'pt-MZ',
      '£': 'en-GB',
      '¥': 'ja-JP'
    };
    
    const locale = locales[currency] || 'pt-PT';
    
    return val.toLocaleString(locale, { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + (['Kz', 'MT', 'Db'].includes(currency) ? ' ' + currency : (['$', '€', 'R$', '£', '¥'].includes(currency) ? '' : ' ' + currency));
  };

  const formatKz = formatCurrency; // Maintain compatibility

  const fetchCustomers = async () => {
    if (!supabaseUser) return;
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', supabaseUser.id)
        .order('name');
      if (error) throw error;
      setCustomers(data || []);
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  };

  useEffect(() => {
    if (showCustomerManager && supabaseUser) {
      fetchCustomers();
    }
  }, [showCustomerManager, supabaseUser]);

  const deleteHistory = (id: string) => {
    if (user) {
      removeInvoiceFromFirebase(id);
    } 
    if (supabaseUser) {
      deleteInvoiceFromSupabase(id);
      setHistory(prev => prev.filter(h => h.id !== id));
    }
    if (!user && !supabaseUser) {
      setHistory(history.filter(h => h.id !== id));
    }
  };

  const updateInvoiceStatus = (id: string, newStatus: 'Pago' | 'Pendente' | 'Vencido' | 'Anulado') => {
    const updatedHistory = history.map(h => h.id === id ? { ...h, status: newStatus } : h);
    setHistory(updatedHistory);
    
    const record = updatedHistory.find(h => h.id === id);
    if (!record) return;

    // Disparar notificação (Push/Local) sobre mudança de status
    showNotification(
      'Status Atualizado',
      `O documento ${record.num} foi atualizado para ${newStatus}.`
    );

    if (user) {
      saveInvoiceToFirebase(record);
    } 
    if (supabaseUser) {
      saveInvoiceToSupabase(record);
    }
    if (!user && !supabaseUser) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
    }
  };

  const exportCurrentItemsCSV = () => {
    if (items.length === 0) return alert('Adicione itens primeiro');
    const headers = ['Descricao', 'Quantidade', 'Preco Unitario', 'Total Item'];
    const rows = items.map(i => [
      `"${i.desc.replace(/"/g, '""')}"`,
      i.qtd,
      i.preco,
      i.total
    ]);
    const csvContent = "\uFEFF" + headers.join(";") + "\n" + rows.map(r => r.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `itens_fatura_${docNum}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportHistoryCSV = () => {
    if (history.length === 0) return alert('Histórico vazio');
    const headers = ['ID', 'Data', 'Numero', 'Tipo', 'Cliente', 'Total Geral'];
    const rows = history.map(h => [
      h.id,
      h.date,
      h.num,
      `"${h.type}"`,
      `"${h.client.replace(/"/g, '""')}"`,
      h.total
    ]);
    const csvContent = "\uFEFF" + headers.join(";") + "\n" + rows.map(r => r.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "historico_90faturas.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [batchClients, setBatchClients] = useState('');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  const generateBatch = () => {
    const names = batchClients.split('\n').map(n => n.trim()).filter(n => n !== '');
    if (names.length === 0) return alert('Insira pelo menos um nome de cliente');
    if (items.length === 0) return alert('Adicione itens à fatura primeiro');

    const newRecords: HistoryRecord[] = names.map((name, index) => ({
      id: (Date.now() + index).toString(),
      date: docData,
      num: `${docNum} (Lote)`,
      type: docTipo,
      client: name,
      total: total,
      subtotal: subtotal,
      taxAmount: taxAmount,
      taxRate: taxRate,
      discountAmount: discountAmount,
      discountRate: discountRate,
      items: [...items],
      dueDate: docDueDate,
      status: docStatus
    }));

    if (user) {
      newRecords.forEach(r => saveInvoiceToFirebase(r));
    } 
    if (supabaseUser) {
      newRecords.forEach(r => saveInvoiceToSupabase(r));
    }
    if (!user && !supabaseUser) {
      setHistory([...newRecords, ...history].slice(0, 50));
    }
    setBatchClients('');
    setShowBatchModal(false);
    alert(`${names.length} faturas geradas em lote e salvas no histórico!`);
  };

  const loadFromHistory = (record: HistoryRecord) => {
    setDocTipo(record.type);
    setDocNum(record.num);
    setDocData(record.date);
    setCliNome(record.client);
    setItems(record.items);
    if (record.taxRate !== undefined) setTaxRate(record.taxRate);
    if (record.discountRate !== undefined) setDiscountRate(record.discountRate);
    setIsTaxEnabled(record.taxAmount ? record.taxAmount > 0 : false);
    if (record.customFields) setCustomFields(record.customFields);
    if (record.dueDate) setDocDueDate(record.dueDate);
    if (record.status) setDocStatus(record.status);
    setShowHistory(false);
  };

  const getQRDataUrl = (size = 150) => {
    // Generate a unique ID for verification (fallback to docNum + date)
    const uniqueId = `${docNum.replace(/[\/\s]/g, '-')}-${Date.now()}`;
    const verificationPortal = `https://90faturas.com/verify/${uniqueId}`;
    
    const fields = [];
    if (qrConfig.includeApp) fields.push(`APP:90FATURAS_PREMIUM`);
    if (qrConfig.includeDocType) fields.push(`DOC:${docTipo}`);
    if (qrConfig.includeId) fields.push(`ID:${docNum}`);
    if (qrConfig.includeNif) fields.push(`NIF:${company.nif || '000000000'}`);
    if (qrConfig.includeClient) fields.push(`CLI:${cliNome}`);
    if (qrConfig.includeValue) fields.push(`VAL:${total}`);
    if (qrConfig.includeDate) fields.push(`DAT:${docData}`);
    if (qrConfig.includeWeb) fields.push(`WEB:${verificationPortal}`);

    const qrValue = fields.join('|');

    const qr = new QRious({
      value: qrValue || '90 FATURAS',
      size: size
    });
    return qr.toDataURL();
  };

  const copyInvoiceText = () => {
    let text = `=================================\n`;
    text += `       ${company.nome || 'EMPRESA PADRÃO'}\n`;
    if (company.nif) text += `NIF: ${company.nif}\n`;
    text += `=================================\n`;
    text += `DOC: ${docTipo}\n`;
    text += `NUM: ${docNum}\n`;
    text += `DATA: ${docData}\n`;
    text += `CLIENTE: ${cliNome}\n`;
    if (cliNif) text += `NIF CLIENTE: ${cliNif}\n`;
    text += `=================================\n`;
    items.forEach(item => {
      text += `${item.qtd}x ${item.desc} ...... ${formatCurrency(item.total)}\n`;
    });
    text += `=================================\n`;
    text += `TOTAL A PAGAR: ${formatCurrency(total)}\n`;
    text += `=================================\n`;
    
    // Add verification link
    const uniqueId = `${docNum.replace(/[\/\s]/g, '-')}-${Date.now()}`;
    const verificationPortal = `https://90faturas.com/verify/${uniqueId}`;
    text += `Verifique em: ${verificationPortal}\n`;

    return text;
  };

  const shareOnWhatsApp = () => {
    const text = copyInvoiceText();
    const encodedText = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encodedText}`, '_blank');
  };

  const copyToClipboard = () => {
    const text = copyInvoiceText();
    navigator.clipboard.writeText(text).then(() => {
      alert('Fatura copiada para a área de transferência!');
    }).catch(err => {
      console.error('Falha ao copiar: ', err);
    });
  };

  const resetInvoice = () => {
    if (confirm('Tem a certeza que deseja zerar a fatura atual?')) {
      setItems([]);
      setCustomFields([]);
      setCliNome('Consumidor Final');
      setCliNif('999999999');
      setDocNum(`FT ${new Date().getFullYear()}/${Math.floor(Math.random() * 1000)}`);
      setDocData(new Date().toISOString().split('T')[0]);
    }
  };

  const generatePDF = (formato: 'a4' | 'termico', action: 'save' | 'print' = 'save') => {
    if (!checkLimit()) return;
    // Save to history first
    const newRecord: HistoryRecord = {
      id: Date.now().toString(),
      date: docData,
      num: docNum,
      type: docTipo,
      client: cliNome,
      total: total,
      subtotal: subtotal,
      taxAmount: taxAmount,
      taxRate: taxRate,
      discountAmount: discountAmount,
      discountRate: discountRate,
      items: [...items],
      customFields: [...customFields],
      dueDate: docDueDate,
      status: docStatus
    };

    // Only add if not duplicate (by ID)
    if (!history.find(h => h.id === newRecord.id)) {
      if (user) {
        saveInvoiceToFirebase(newRecord);
      } 
      if (supabaseUser) {
        saveInvoiceToSupabase(newRecord);
      }
      if (!user && !supabaseUser) {
        setHistory([newRecord, ...history].slice(0, 50)); // Keep last 50
      }
      
      // Auto Cloud Backup Trigger
      if (autoBackupCloud && supabaseUser) {
        uploadBackupToSupabase([...history, newRecord], supabaseUser.id)
          .catch(err => console.error('Auto backup failed:', err));
      }
    }

    const doc = new jsPDF(formato === 'a4' ? { orientation: 'p', unit: 'mm', format: 'a4' } : { unit: 'mm', format: [58, 85 + items.length * 8 + (customFields.length * 4)] });
    const qrImg = getQRDataUrl(100);
    const dataFomated = docData.split('-').reverse().join('/');

    if (formato === 'a4') {
      // Watermark
      if (wmCheck) {
        doc.setTextColor(230);
        doc.setFontSize(60);
        doc.text(wmText, 40, 150, { angle: 45 });
        doc.setTextColor(0);
      }

      // PDF Templates Logic
      if (pdfTemplate === 'MODERN') {
        // Modern Style: Dark Header, Sleek lines
        doc.setFillColor(21, 25, 35);
        doc.rect(0, 0, 210, 40, 'F');
        
        if (company.logo) {
          doc.addImage(company.logo, 'JPEG', 15, 12, 30, 15);
        }
        
        doc.setTextColor(255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(company.nome.toUpperCase() || 'EMPRESA PADRÃO', 195, 20, { align: 'right' });
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`NIF: ${company.nif || '000000000'} | ${company.pais}`, 195, 26, { align: 'right' });
        if (company.tel) doc.text(`TEL: ${company.tel}`, 195, 31, { align: 'right' });

        doc.setTextColor(0);
      } else if (pdfTemplate === 'MINIMALIST') {
        // Minimalist: Clean, very light
        if (company.logo) {
          doc.addImage(company.logo, 'JPEG', 15, 15, 25, 12);
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(company.nome.toUpperCase(), 15, 35);
        doc.setFontSize(8);
        doc.text(`NIF: ${company.nif}`, 15, 39);
      } else {
        // Classic: Traditional centered title or right aligned
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(company.nome.toUpperCase(), 105, 20, { align: 'center' });
        doc.line(15, 25, 195, 25);
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`NIF: ${company.nif}`, 105, 30, { align: 'center' });
        doc.text(`${company.cidade} - ${company.pais}`, 105, 35, { align: 'center' });
      }

      // Documentation info
      if (pdfTemplate !== 'MODERN') doc.setTextColor(0);
      
      const docInfoY = pdfTemplate === 'MODERN' ? 55 : 45;
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(docTipo, 15, docInfoY);
      
      doc.setFontSize(11);
      if (pdfTemplate === 'MODERN') {
        doc.setTextColor(212, 175, 55);
      } else {
        doc.setTextColor(0);
      }
      doc.text(docNum, 15, docInfoY + 7);
      
      doc.setTextColor(0);

      // Client Info Position
      const clientY = docInfoY + 25; // Increased spacing here
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('FACTURADO A:', 15, clientY);
      doc.setFont('helvetica', 'normal');
      doc.text(cliNome.toUpperCase(), 15, clientY + 5);
      doc.text(`NIF: ${cliNif}`, 15, clientY + 10);
      
      doc.setFont('helvetica', 'bold');
      doc.text('DATA DE EMISSÃO:', 195, clientY, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.text(dataFomated, 195, clientY + 5, { align: 'right' });

      // Bank Info (If present)
      if (company.banco || company.iban) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('DADOS BANCÁRIOS:', 15, clientY + 20);
        doc.setFont('helvetica', 'normal');
        let bankText = "";
        if (company.banco) bankText += `BANCO: ${company.banco}`;
        if (company.iban) bankText += `${bankText ? ' | ' : ''}IBAN: ${company.iban}`;
        doc.text(bankText, 15, clientY + 24);
      }

      doc.addImage(qrImg, 'JPEG', 170, docInfoY - 5, 25, 25);

      let currentY = clientY + (company.banco || company.iban ? 35 : 25); // Adjusted table start

      // Table
      const tableBody = items.map(i => [i.desc, i.qtd, formatCurrency(i.preco), formatCurrency(i.total)]);
      autoTable(doc, {
        startY: currentY,
        head: [['DESCRIÇÃO', 'QTD', 'P. UNIT', 'TOTAL']],
        body: tableBody,
        theme: pdfTemplate === 'MINIMALIST' ? 'plain' : 'grid',
        headStyles: { 
          fillColor: pdfTemplate === 'MODERN' ? [21, 25, 35] : pdfTemplate === 'CLASSIC' ? [100, 100, 100] : [255, 255, 255],
          textColor: pdfTemplate === 'MINIMALIST' ? [0, 0, 0] : [255, 255, 255],
          fontStyle: 'bold'
        },
        columnStyles: {
          1: { halign: 'center' },
          2: { halign: 'right' },
          3: { halign: 'right' }
        }
      });

      // Totals
      currentY = (doc as any).lastAutoTable.finalY + 10;

      // Custom Fields
      let customY = currentY;
      doc.setFontSize(9);
      customFields.forEach(field => {
        if (field.key && field.value) {
          doc.setFont('helvetica', 'bold');
          doc.text(`${field.key.toUpperCase()}:`, 15, customY);
          doc.setFont('helvetica', 'normal');
          doc.text(field.value, 46, customY);
          customY += 5;
        }
      });
      
      doc.setFontSize(10);
      if (discountAmount > 0) {
        doc.text(`SUBTOTAL: ${formatCurrency(subtotal)}`, 195, currentY, { align: 'right' });
        currentY += 5;
        doc.text(`DESCONTO: -${formatCurrency(discountAmount)}`, 195, currentY, { align: 'right' });
        currentY += 5;
      }
      if (taxAmount > 0) {
        doc.text(`IVA (${taxRate}%): ${formatCurrency(taxAmount)}`, 195, currentY, { align: 'right' });
        currentY += 7;
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      if (pdfTemplate === 'MODERN') {
        doc.setTextColor(180, 150, 0);
      }
      doc.text(`TOTAL A PAGAR: ${formatCurrency(total)}`, 195, currentY, { align: 'right' });

      // Footer
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text('Documento processado por computador - 90 Faturas Premium', 105, 285, { align: 'center' });

      if (action === 'save') {
        doc.save(`${docTipo}_${cliNome}_${docNum}.pdf`);
      } else {
        doc.autoPrint();
        const url = doc.output('bloburl');
        window.open(url, '_blank');
      }
    } else {
      // Thermal Receipt Optimization
      let y = 5;
      const cx = 28;
      if (company.logo) {
        doc.addImage(company.logo, 'JPEG', 19, y, 20, 10);
        y += 12;
      }
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(company.nome.substring(0, 30).toUpperCase(), cx, y, { align: 'center' });
      y += 3.5;
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.text(`NIF: ${company.nif}`, cx, y, { align: 'center' });
      y += 3;
      doc.text(`${company.cidade} | ${company.pais}`, cx, y, { align: 'center' });
      
      if (company.banco || company.iban) {
        y += 3;
        if (company.banco) {
          doc.text(`Banco: ${company.banco}`, cx, y, { align: 'center' });
          y += 3;
        }
        if (company.iban) {
          doc.setFontSize(5);
          doc.text(`IBAN: ${company.iban}`, cx, y, { align: 'center' });
          y += 3;
        }
      }
      y += 2;

      doc.setFontSize(7);
      doc.text('-----------------------------------', cx, y, { align: 'center' });
      y += 3.5;
      doc.setFont('helvetica', 'bold');
      doc.text(docTipo, cx, y, { align: 'center' });
      y += 3.5;
      doc.text(docNum, cx, y, { align: 'center' });
      y += 3.5;
      doc.setFont('helvetica', 'normal');
      doc.text(`Data: ${dataFomated}`, cx, y, { align: 'center' });
      y += 3.5;
      doc.text('-----------------------------------', cx, y, { align: 'center' });
      y += 3.5;

      doc.text(`Cli: ${cliNome.substring(0, 25)}`, 2, y);
      y += 4;

      customFields.forEach(field => {
        if (field.key && field.value) {
          doc.text(`${field.key}: ${field.value}`, 2, y);
          y += 3.5;
        }
      });
      if (customFields.length > 0) y += 0.5;

      items.forEach(i => {
        doc.text(`${i.desc.substring(0, 35)}`, 2, y);
        y += 2.5;
        doc.text(`${i.qtd} x ${formatCurrency(i.preco)} = ${formatCurrency(i.total)}`, 56, y, { align: 'right' });
        y += 3.5;
      });

      doc.text('-----------------------------------', cx, y, { align: 'center' });
      y += 3.5;
      if (discountAmount > 0) {
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text(`Subtotal: ${formatCurrency(subtotal)}`, 56, y, { align: 'right' });
        y += 2.5;
        doc.text(`Desconto (${discountRate}%): -${formatCurrency(discountAmount)}`, 56, y, { align: 'right' });
        y += 3.5;
      }
      if (taxAmount > 0) {
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        if (discountAmount === 0) {
          doc.text(`Subtotal: ${formatCurrency(subtotal)}`, 56, y, { align: 'right' });
          y += 2.5;
        }
        doc.text(`IVA (${taxRate}%): ${formatCurrency(taxAmount)}`, 56, y, { align: 'right' });
        y += 3.5;
      }
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`TOTAL: ${formatCurrency(total)}`, 56, y, { align: 'right' });
      y += 7;

      doc.addImage(qrImg, 'JPEG', 21, y, 16, 16);
      y += 18;
      doc.setFontSize(5);
      doc.setFont('helvetica', 'normal');
      doc.text('SISTEMA 90 FATURAS', cx, y, { align: 'center' });
      y += 2;
      doc.text('PRODUZIDO POR GRUPO 90', cx, y, { align: 'center' });

      if (action === 'save') {
        doc.save(`Talão_${cliNome}.pdf`);
      } else {
        doc.autoPrint();
        const url = doc.output('bloburl');
        window.open(url, '_blank');
      }
      incrementDailyCount();
    }
  };

  const exportToPNG = async () => {
    if (!checkLimit()) return;
    if (invoiceRef.current) {
      try {
        // Wait a bit to ensure elements are rendered
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const canvas = await html2canvas(invoiceRef.current, {
          scale: 3, // Increased scale for better resolution
          useCORS: true, 
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false
        });
        const image = canvas.toDataURL("image/png");
        const link = document.createElement('a');
        link.href = image;
        link.download = `${docTipo}_${cliNome}_${docNum}.png`;
        link.click();
        incrementDailyCount();
      } catch (error) {
        console.error("Error generating PNG", error);
        alert("Ocorreu um erro ao gerar a imagem PNG. Tente novamente.");
      }
    }
  };

  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setShowSyncSuccess(true);
      setTimeout(() => setShowSyncSuccess(false), 3000);
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const monthlySalesData = useMemo(() => {
    if (history.length === 0) return [];
    const grouped = history.reduce((acc, curr) => {
      const monthStr = curr.date.substring(0, 7); 
      if (!acc[monthStr]) acc[monthStr] = 0;
      acc[monthStr] += curr.total;
      return acc;
    }, {} as Record<string, number>);

    return Object.keys(grouped).sort().map(key => {
      const [year, month] = key.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      const monthName = date.toLocaleString('pt-BR', { month: 'short' });
      return {
        name: `${monthName.toUpperCase()}/${year}`,
        Total: grouped[key]
      };
    });
  }, [history]);

  return (
    <div className="min-h-screen pb-24 md:p-6 p-4 max-w-4xl mx-auto flex flex-col items-center justify-center">
      
      <AnimatePresence mode="wait">
        {!supabaseUser && !isAuthScreen ? (
          <motion.div 
            key="login-intro"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="text-center w-full max-w-md"
          >
             {adminAnnouncement && (
               <div className="mb-6 p-4 bg-accent-blue/10 border border-accent-blue/20 rounded-2xl text-accent-blue text-[10px] font-bold uppercase tracking-widest animate-pulse">
                  📢 {adminAnnouncement}
               </div>
             )}
             
             <div className="bg-slate-900/50 backdrop-blur-3xl p-10 rounded-[3rem] border border-white/5 shadow-2xl">
               <div className="mb-8">
                  <div className="w-24 h-24 bg-accent-blue/10 rounded-3xl flex items-center justify-center mx-auto mb-6 overflow-hidden">
                     <motion.img 
                        src="/icon.png" 
                        alt="90 Faturas Logo" 
                        className="w-full h-full object-contain"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ 
                           opacity: 1, 
                           scale: [1, 1.05, 1],
                           rotate: [0, 2, -2, 0]
                        }}
                        transition={{
                           scale: { duration: 4, repeat: Infinity, ease: "easeInOut" },
                           rotate: { duration: 5, repeat: Infinity, ease: "easeInOut" },
                           opacity: { duration: 0.5 }
                        }}
                     />
                  </div>
                  <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic">90 FATURAS</h1>
                  <p className="text-slate-500 font-bold text-[10px] tracking-[0.3em] uppercase mt-2">Professional Billing Cloud</p>
               </div>

               <div className="space-y-6">
                  <button 
                    onClick={() => setIsAuthScreen(true)}
                    className="w-full bg-accent-blue text-white h-16 rounded-[2rem] font-black uppercase tracking-[0.2em] hover:bg-blue-600 transition-all shadow-2xl shadow-accent-blue/40 flex items-center justify-center gap-3 active:scale-95 group"
                  >
                     <span>Entrar no Sistema</span>
                     <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                  
                  <div className="flex items-center justify-center gap-8">
                    <button 
                      onClick={() => { setShowSupabaseAuth(true); setIsAuthScreen(true); }}
                      className="text-[10px] font-black text-slate-400 hover:text-white uppercase tracking-widest transition-colors"
                    >
                       Criar Nova Conta
                    </button>
                    <div className="w-1 h-1 bg-white/20 rounded-full" />
                    <button 
                      onClick={() => { setShowSupabaseAuth(true); setIsAuthScreen(true); }}
                      className="text-[10px] font-black text-slate-400 hover:text-white uppercase tracking-widest transition-colors"
                    >
                       Recuperar Acesso
                    </button>
                  </div>

                  <div className="pt-2">
                    <button 
                      onClick={() => { setSupabaseUser({} as any); setIsAuthScreen(true); }}
                      className="text-[9px] font-black text-slate-600 hover:text-slate-400 uppercase tracking-[0.3em] transition-all border-b border-transparent hover:border-slate-500 pb-1"
                    >
                       Continuar no Modo Offline (Teste)
                    </button>
                  </div>
               </div>

               <div className="mt-10 pt-8 border-t border-white/5">
                  <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] mb-6">Redes Sociais Oficiais</p>
                  <div className="flex justify-center gap-6">
                    <a href="https://facebook.com" target="_blank" rel="noreferrer" className="text-[#1877F2] hover:scale-125 transition-all drop-shadow-[0_0_10px_rgba(24,119,242,0.3)]"><Facebook size={24} fill="currentColor" /></a>
                    <a href="https://instagram.com" target="_blank" rel="noreferrer" className="text-[#E4405F] hover:scale-125 transition-all drop-shadow-[0_0_10px_rgba(228,64,95,0.3)]"><Instagram size={24} /></a>
                    <a href="https://youtube.com" target="_blank" rel="noreferrer" className="text-[#FF0000] hover:scale-125 transition-all drop-shadow-[0_0_10px_rgba(255,0,0,0.3)]"><YoutubeIcon size={24} /></a>
                    <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="text-[#0A66C2] hover:scale-125 transition-all drop-shadow-[0_0_10px_rgba(10,102,194,0.2)]"><Linkedin size={24} fill="currentColor" /></a>
                    <a href="https://wa.me/244900000000" target="_blank" rel="noreferrer" className="text-[#25D366] hover:scale-125 transition-all drop-shadow-[0_0_10px_rgba(37,211,102,0.3)]"><MessageCircle size={24} fill="currentColor" /></a>
                  </div>
               </div>
             </div>

             <div className="mt-8 flex justify-center gap-8">
                <div className="text-center">
                   <p className="text-white font-black text-lg italic">100%</p>
                   <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">Seguro</p>
                </div>
                <div className="text-center border-x border-white/5 px-8">
                   <p className="text-white font-black text-lg italic">PDF</p>
                   <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">A4 & Térmico</p>
                </div>
                <div className="text-center">
                   <p className="text-white font-black text-lg italic">SOBA</p>
                   <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">Modo Master</p>
                </div>
             </div>
             <p className="text-[8px] text-slate-700 font-bold uppercase tracking-[0.3em] mt-8">Copyright © 2026 Grupo 90 Creations</p>
          </motion.div>
        ) : isAuthScreen && !supabaseUser ? (
          <motion.div 
            key="auth-view"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-full max-w-md"
          >
             <div className="mb-6 flex items-center justify-between">
                <button onClick={() => setIsAuthScreen(false)} className="text-slate-500 hover:text-white flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                   Voltar
                </button>
             </div>
             {/* Note: AuthModal is usually a modal, but here we can force it open or just use its logic */}
             <div className="bg-slate-900 border border-white/5 p-8 rounded-3xl shadow-2xl">
                <div className="text-center mb-8">
                   <div className="w-16 h-16 bg-accent-blue/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Crown size={32} className="text-accent-blue" />
                   </div>
                   <h2 className="text-2xl font-black text-white uppercase italic">Acesso Restrito</h2>
                   <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mt-1">Conectando ao Supabase Cloud...</p>
                </div>
                <button 
                  onClick={() => setShowSupabaseAuth(true)}
                  className="w-full bg-accent-blue text-white h-14 rounded-xl font-black uppercase tracking-widest mb-4"
                >
                   Fazer Login ou Criar Conta
                </button>
                <div className="text-center">
                  <p className="text-[9px] text-slate-600 font-bold">Ao entrar você concorda com os termos de licença do Grupo 90.</p>
                </div>
             </div>
          </motion.div>
        ) : (
          <motion.div 
            key="app-hub"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full"
          >
            <div className="min-h-screen pb-24 md:pb-10 w-full max-w-4xl mx-auto">
      
      <AnimatePresence>
        {isOffline && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000] bg-accent-red/90 text-white text-[10px] py-1.5 px-5 rounded-full font-black border border-white/20 flex items-center gap-2 shadow-2xl backdrop-blur-md whitespace-nowrap"
          >
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            MODO OFFLINE • DADOS PROTEGIDOS LOCALMENTE
          </motion.div>
        )}
        {showSyncSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000] bg-emerald-500/90 text-white text-[10px] py-1.5 px-5 rounded-full font-black border border-white/20 flex items-center gap-2 shadow-2xl backdrop-blur-md whitespace-nowrap"
          >
            <div className="w-2 h-2 bg-white rounded-full" />
            CONEXÃO RESTABELECIDA • SISTEMA SINCRONIZADO
          </motion.div>
        )}
      </AnimatePresence>

      <div className="text-center mb-6">
         <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider bg-white/5 py-1 px-3 rounded-full border border-border-custom inline-flex items-center gap-2">
           <div className={`w-1.5 h-1.5 rounded-full ${lastSaved ? 'bg-emerald-500' : 'bg-slate-700'}`} />
           Auto-save: {lastSaved || 'Aguardando dados...'}
         </span>
      </div>
      <header className="text-center mb-8 pt-4 flex flex-col items-center">
        <motion.img 
          src="/icon.png" 
          alt="90 Faturas Logo" 
          className="w-20 h-20 object-contain mb-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ 
            opacity: 1, 
            y: 0,
            scale: [1, 1.03, 1]
          }}
          transition={{
            scale: { duration: 5, repeat: Infinity, ease: "easeInOut" },
            opacity: { duration: 0.8 },
            y: { duration: 0.8 }
          }}
        />
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl md:text-4xl font-extrabold tracking-tight bg-linear-to-r from-accent-blue to-blue-500 bg-clip-text text-transparent"
        >
          90 FATURAS
        </motion.h1>
        <p className="text-slate-500 text-xs mt-1 font-medium tracking-widest uppercase">
          Premium Edition • Grupo 90 Creations
        </p>

        <motion.div 
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowPremiumModal(true)}
          className={`inline-block mt-4 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase cursor-pointer border ${
            isSoba 
              ? 'bg-accent-gold/10 text-accent-gold border-accent-gold shadow-[0_0_15px_rgba(255,204,0,0.2)]' 
              : 'bg-white/5 text-slate-500 border-border-custom hover:border-accent-gold hover:text-accent-gold'
          }`}
        >
          {isSoba ? (
            <span className="flex items-center gap-1.5">
              <Crown size={12} className="fill-accent-gold" /> MESTRE SOBA ATIVO
            </span>
          ) : (
            'MODO VISITANTE (APOIAR APP / CLIQUE PARA UPGRADE)'
          )}
        </motion.div>

        <div className="flex justify-center gap-3 mt-4">
          <div className="bg-white/5 border border-border-custom px-4 py-2 rounded-xl text-center">
             <p className="text-[8px] font-black uppercase text-slate-500 tracking-[0.2em] mb-0.5">Limite Diário</p>
             <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                   <div 
                     className={`h-full transition-all ${userLevel === 'free' && dailyGeneratedCount >= 2 ? 'bg-accent-red' : 'bg-accent-blue'}`}
                     style={{ width: `${Math.min(100, (dailyGeneratedCount / (userLevel === 'soba' ? 100 : (userLevel === 'donor' ? 10 : 2))) * 100)}%` }}
                   />
                </div>
                <span className="text-[10px] font-black text-slate-400">
                  {dailyGeneratedCount}/{userLevel === 'soba' ? '∞' : (userLevel === 'donor' ? '10' : '2')}
                </span>
             </div>
          </div>
        </div>

        {userLevel === 'free' && (
          <div className="mt-4 mx-auto max-w-sm px-4 py-2 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 border border-blue-500/20 rounded-xl">
             <p className="text-[9px] text-blue-400 font-bold uppercase tracking-wider text-center">
               ANÚNCIO: Grupo 90 - Criação de Apps Profissionais • <span className="underline cursor-pointer" onClick={() => setShowPremiumModal(true)}>Remover</span>
             </p>
          </div>
        )}

        <div className="flex justify-center gap-3 mt-4">
          <motion.button 
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold tracking-widest uppercase cursor-pointer border bg-white/5 text-slate-400 border-border-custom hover:bg-white/10"
          >
            <FileText size={14} /> Histórico
          </motion.button>

          <motion.button 
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              if (supabaseUser) {
                setShowCustomerManager(true);
              } else {
                setShowSupabaseAuth(true);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold tracking-widest uppercase cursor-pointer border bg-white/5 text-slate-400 border-border-custom hover:bg-white/10"
          >
            <User size={14} /> Clientes
          </motion.button>

          <div className="relative">
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowBackupMenu(!showBackupMenu)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold tracking-widest uppercase cursor-pointer border hover:bg-white/10 ${showBackupMenu ? 'bg-white/10 border-accent-blue text-white' : 'bg-white/5 text-slate-400 border-border-custom'}`}
            >
              <Cloud size={14} /> Backups
            </motion.button>

            <AnimatePresence>
              {showBackupMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full mt-2 right-0 w-64 bg-slate-900 border border-white/10 rounded-2xl p-4 shadow-2xl z-[100] backdrop-blur-xl"
                >
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Gestão de Backups</p>
                  
                  <div className="space-y-3">
                    <button 
                      onClick={() => exportHistoryAsJSON(history)}
                      className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all group"
                    >
                      <div className="text-left">
                        <p className="text-[10px] font-bold text-white uppercase">Exportar JSON</p>
                        <p className="text-[8px] text-slate-500 uppercase">Download local imediato</p>
                      </div>
                      <Download size={16} className="text-slate-500 group-hover:text-white" />
                    </button>

                    <button 
                      onClick={handleManualBackup}
                      disabled={isBackupProcessing || !supabaseUser}
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition-all group ${!supabaseUser ? 'opacity-50 cursor-not-allowed' : 'bg-accent-blue/10 hover:bg-accent-blue/20'}`}
                    >
                      <div className="text-left">
                        <p className={`text-[10px] font-bold uppercase ${!supabaseUser ? 'text-slate-500' : 'text-accent-blue'}`}>Backup p/ Cloud</p>
                        <p className="text-[8px] text-slate-500 uppercase">Supabase Storage</p>
                      </div>
                      {isBackupProcessing ? (
                        <RefreshCw size={16} className="text-accent-blue animate-spin" />
                      ) : (
                        <Cloud size={16} className={!supabaseUser ? 'text-slate-500' : 'text-accent-blue'} />
                      )}
                    </button>

                    <div className="pt-2 border-t border-white/5 mt-2 flex items-center justify-between">
                       <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Backup Automático</p>
                       <button 
                        onClick={() => setAutoBackupCloud(!autoBackupCloud)}
                        className={`w-10 h-5 rounded-full transition-all relative flex items-center px-1 ${autoBackupCloud ? 'bg-accent-blue' : 'bg-slate-700'}`}
                       >
                         <motion.div 
                          animate={{ x: autoBackupCloud ? 20 : 0 }}
                          className="w-3 h-3 bg-white rounded-full shadow-md" 
                         />
                       </button>
                    </div>
                  </div>

                  {!supabaseUser && (
                    <p className="text-[8px] text-accent-red font-bold uppercase mt-4 text-center animate-pulse">Precisa de Login Cloud para Backup</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-4 mt-6 p-2 bg-white/5 border border-white/5 rounded-2xl max-w-sm mx-auto">
          {supabaseUser ? (
             <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-accent-blue/20 flex items-center justify-center text-accent-blue">
                   <User size={16} />
                </div>
                <div className="text-left">
                   <p className="text-[9px] font-black text-white uppercase tracking-tighter truncate w-24">{supabaseUser.email?.split('@')[0]}</p>
                   <p className="text-[7px] text-emerald-400 font-bold uppercase">Sincronizado</p>
                </div>
                <button 
                  onClick={() => supabase.auth.signOut()}
                  className="p-1.5 text-slate-500 hover:text-accent-red"
                >
                   <X size={14} />
                </button>
             </div>
          ) : (
            <button 
              onClick={() => setShowSupabaseAuth(true)}
              className="px-4 py-1.5 rounded-full text-[9px] font-black text-accent-blue uppercase tracking-widest border border-accent-blue/30 hover:bg-accent-blue/10 transition-all"
            >
               Conectar Nuvem
            </button>
          )}
          
          <div className="w-px h-6 bg-white/10" />

          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-red-500' : 'bg-emerald-500'}`} />
            <span className="text-[8px] font-black text-slate-500 uppercase">{isOffline ? 'Offline' : 'Online'}</span>
          </div>
        </div>

        <AuthModal 
          isOpen={showSupabaseAuth} 
          onClose={() => setShowSupabaseAuth(false)} 
        />
      </header>

      {/* Main Content */}
      <div className="grid grid-cols-1 md:gap-6 gap-0">
        
        {/* Card: Doc Details */}
        <div className="card">
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border-custom">
            <FileText size={18} className="text-accent-blue" />
            <h2 className="text-sm font-bold text-accent-blue uppercase tracking-wider">Detalhes da Fatura</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label-custom">Tipo de Documento</label>
              <select 
                className="input-custom appearance-none"
                value={docTipo}
                onChange={(e) => setDocTipo(e.target.value)}
              >
                <option>FACTURA / RECIBO</option>
                <option>FACTURA PRÓ-FORMA</option>
                <option>RECIBO</option>
              </select>
            </div>
            <div>
              <label className="label-custom">Template PDF (A4)</label>
              <select 
                className="input-custom appearance-none border-accent-blue/30 focus:border-accent-blue"
                value={pdfTemplate}
                onChange={(e) => setPdfTemplate(e.target.value as any)}
              >
                <option value="MODERN">🛸 Moderno (Futurista)</option>
                <option value="MINIMALIST">⚪ Minimalista (Clean)</option>
                <option value="CLASSIC">🏛️ Clássico (Formal)</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="label-custom">Número</label>
            <input 
              className="input-custom"
              value={docNum}
              onChange={(e) => setDocNum(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label-custom">Data de Emissão {!isSoba && '(Soba)'}</label>
              <input 
                type="date"
                className="input-custom"
                value={docData}
                disabled={!isSoba}
                onChange={(e) => setDocData(e.target.value)}
              />
            </div>
            <div>
              <label className="label-custom">Data de Vencimento</label>
              <input 
                type="date"
                className="input-custom border-amber-500/30 focus:border-amber-500"
                value={docDueDate}
                onChange={(e) => setDocDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="mb-4">
             <label className="label-custom">Status Inicial</label>
             <div className="flex gap-2">
                {['Pendente', 'Pago', 'Anulado'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setDocStatus(s as any)}
                    className={`flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                      docStatus === s 
                        ? (s === 'Pago' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : s === 'Anulado' ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-amber-500/20 border-amber-500 text-amber-500')
                        : 'bg-white/5 border-white/10 text-slate-500 hover:border-white/20'
                    }`}
                  >
                    {s}
                  </button>
                ))}
             </div>
          </div>

          <div className="bg-black/20 p-4 rounded-lg border border-border-custom flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Marca d'água</p>
              <p className="text-[10px] text-slate-500 uppercase mt-0.5">Visível apenas no PDF A4</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={wmCheck}
                onChange={(e) => setWmCheck(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-blue"></div>
            </label>
          </div>
          
          {wmCheck && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4">
              <input 
                className="input-custom"
                placeholder="Texto da Marca (ex: ORIGINAL)"
                value={wmText}
                onChange={(e) => setWmText(e.target.value)}
              />
            </motion.div>
          )}
        </div>

        {/* Card: Company Details */}
        <div className="card">
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border-custom">
            <Building2 size={18} className="text-accent-blue" />
            <h2 className="text-sm font-bold text-accent-blue uppercase tracking-wider">Dados da Empresa</h2>
          </div>

          <div 
            onClick={() => isSoba && document.getElementById('logoInput')?.click()}
            className={`mb-5 p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer ${
              isSoba ? 'border-accent-blue/30 bg-accent-blue/5 hover:bg-accent-blue/10' : 'border-border-custom bg-black/10'
            }`}
          >
            {company.logo ? (
              <img src={company.logo} className="max-h-16 object-contain" alt="Logo" />
            ) : (
              <>
                <ImageIcon size={32} className="text-slate-600" />
                <p className="text-[11px] text-slate-500 font-bold uppercase">
                  {isSoba ? 'Clique para carregar logo' : 'Logo indisponível (Modo Visitante)'}
                </p>
              </>
            )}
            <input 
              id="logoInput"
              type="file" 
              className="hidden" 
              accept="image/*"
              onChange={handleLogoUpload}
            />
          </div>

          <div className="mb-4">
            <label className="label-custom">Nome / Razão Social</label>
            <input 
              className="input-custom"
              placeholder="Sua Empresa Lda"
              value={company.nome}
              onChange={(e) => setCompany({ ...company, nome: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-custom">Sigla</label>
              <input 
                className="input-custom"
                placeholder="Ex: 90Creat"
                value={company.sigla}
                onChange={(e) => setCompany({ ...company, sigla: e.target.value })}
              />
            </div>
            <div>
              <label className="label-custom">NIF {!isSoba && '(Soba)'}</label>
              <input 
                className={`input-custom ${!isNifValid(company.nif) ? '!border-accent-red/50 !bg-accent-red/5' : ''}`}
                placeholder="NIF Empresa"
                disabled={!isSoba}
                value={company.nif}
                onChange={(e) => setCompany({ ...company, nif: e.target.value })}
              />
              {!isNifValid(company.nif) && <p className="text-[8px] text-accent-red font-bold uppercase mt-1">NIF Inválido</p>}
            </div>
          </div>

          <div className="mt-4">
            <label className="label-custom">Endereço Completo {!isSoba && '(Soba)'}</label>
            <input 
              className="input-custom"
              placeholder="Rua, Bairro..."
              disabled={!isSoba}
              value={company.end}
              onChange={(e) => setCompany({ ...company, end: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="label-custom">País {!isSoba && '(Soba)'}</label>
              <div className="relative">
                <input 
                  className="input-custom pl-8"
                  disabled={!isSoba}
                  value={company.pais}
                  list="country-list"
                  placeholder="Selecione ou digite..."
                  onChange={(e) => handleCountryChange(e.target.value)}
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm">
                  {countryDataList.find(c => c.name.toLowerCase() === company.pais.toLowerCase())?.flag || '🏳️'}
                </span>
              </div>
              <datalist id="country-list">
                {countryDataList.map(c => <option key={c.name} value={c.name}>{c.flag} {c.name}</option>)}
              </datalist>
            </div>
            <div>
              <label className="label-custom">Cidade {!isSoba && '(Soba)'}</label>
              <input 
                className="input-custom"
                placeholder="Luanda"
                list="city-list"
                disabled={!isSoba}
                value={company.cidade}
                onChange={(e) => setCompany({ ...company, cidade: e.target.value })}
              />
              <datalist id="city-list">
                {commonCities.map(city => <option key={city} value={city} />)}
              </datalist>
            </div>
          </div>

          <div className="mt-4">
            <label className="label-custom">Email da Empresa {!isSoba && '(Soba)'}</label>
            <input 
              type="email"
              className="input-custom"
              placeholder="contato@empresa.com"
              disabled={!isSoba}
              value={company.email}
              onChange={(e) => setCompany({ ...company, email: e.target.value })}
            />
          </div>

          <div className="mt-4">
            <label className="label-custom">Contacto Telefónico {!isSoba && '(Soba)'}</label>
            <input 
              className="input-custom"
              placeholder="+244 900 000 000"
              disabled={!isSoba}
              value={company.tel}
              onChange={(e) => setCompany({ ...company, tel: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="label-custom">Nome do Banco {!isSoba && '(Soba)'}</label>
              <input 
                className="input-custom"
                placeholder="Ex: Banco BAI"
                disabled={!isSoba}
                value={company.banco}
                onChange={(e) => setCompany({ ...company, banco: e.target.value })}
              />
            </div>
            <div>
              <label className="label-custom">IBAN {!isSoba && '(Soba)'}</label>
              <input 
                className="input-custom"
                placeholder="AO06.0000.0000..."
                disabled={!isSoba}
                value={company.iban}
                onChange={(e) => setCompany({ ...company, iban: e.target.value })}
              />
            </div>
          </div>

          {isSoba && (
             <button 
                onClick={handleLogout}
                className="mt-6 flex items-center gap-2 text-[10px] text-accent-red font-bold uppercase tracking-widest hover:underline"
              >
                Sair do Modo Soba
              </button>
          )}
        </div>

        {/* Card: Client Details */}
        <div className="card">
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border-custom">
            <User size={18} className="text-accent-blue" />
            <h2 className="text-sm font-bold text-accent-blue uppercase tracking-wider">Dados do Cliente</h2>
          </div>
            <div className="mb-4 flex gap-2">
              <div className="flex-1">
                <label className="label-custom">Nome do Cliente</label>
                <input 
                  className="input-custom"
                  placeholder="Consumidor Final"
                  value={cliNome}
                  onChange={(e) => setCliNome(e.target.value)}
                />
              </div>
              {supabaseUser && (
                <div className="flex items-end pb-0.5">
                  <button 
                    onClick={() => saveCustomerToSupabase({ name: cliNome, nif: cliNif, email: cliEmail }).then(() => alert('Cliente salvo no catálogo!'))}
                    className="p-3 bg-accent-blue/10 text-accent-blue rounded-xl border border-accent-blue/20 hover:bg-accent-blue/20"
                    title="Salvar no Catálogo"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              )}
            </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-custom">NIF do Cliente</label>
              <input 
                className={`input-custom ${!isNifValid(cliNif) ? '!border-accent-red/50 !bg-accent-red/5' : ''}`}
                placeholder="999999999"
                value={cliNif}
                onChange={(e) => setCliNif(e.target.value)}
              />
              {!isNifValid(cliNif) && <p className="text-[8px] text-accent-red font-bold uppercase mt-1">NIF Inválido</p>}
            </div>
            <div>
              <label className="label-custom">Email do Cliente</label>
              <input 
                className="input-custom"
                placeholder="cliente@email.com"
                value={cliEmail}
                onChange={(e) => setCliEmail(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Card: Custom Fields */}
        <div className="card">
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border-custom">
            <Plus size={18} className="text-accent-blue" />
            <h2 className="text-sm font-bold text-accent-blue uppercase tracking-wider">Campos Personalizados</h2>
          </div>
          <p className="text-[10px] text-slate-500 uppercase font-bold mb-4">Adicione informações extras como "Referência de Pagamento", "Vendedor", etc.</p>
          
          <div className="space-y-3">
            <AnimatePresence>
              {customFields.map((field, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center"
                >
                  <input 
                    className="input-custom !py-2 text-[11px]" 
                    placeholder="Chave (ex: Vendedor)" 
                    value={field.key}
                    onChange={(e) => {
                      const newFields = [...customFields];
                      newFields[idx].key = e.target.value;
                      setCustomFields(newFields);
                    }}
                  />
                  <input 
                    className="input-custom !py-2 text-[11px]" 
                    placeholder="Valor (ex: João)" 
                    value={field.value}
                    onChange={(e) => {
                      const newFields = [...customFields];
                      newFields[idx].value = e.target.value;
                      setCustomFields(newFields);
                    }}
                  />
                  <button 
                    onClick={() => setCustomFields(customFields.filter((_, i) => i !== idx))}
                    className="text-accent-red p-2"
                  >
                    <Trash2 size={14} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>

            <button 
              onClick={() => setCustomFields([...customFields, { key: '', value: '' }])}
              className="flex items-center gap-2 text-[10px] text-accent-blue font-bold uppercase tracking-widest hover:underline mt-2"
            >
              <Plus size={12} /> Adicionar Campo
            </button>
          </div>
        </div>

        {/* Card: Tax & Discount Configuration */}
        <div className="card">
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border-custom">
            <Settings size={18} className="text-accent-blue" />
            <h2 className="text-sm font-bold text-accent-blue uppercase tracking-wider">Impostos e Descontos</h2>
          </div>
          
            <div className="bg-black/20 p-4 rounded-xl border border-border-custom">
              <label className="label-custom">Moeda da Fatura</label>
              <select 
                className="input-custom"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {['Kz', '$', '€', 'R$', 'MT', '£', 'CVE', 'CFA', 'Db', 'R', '¥'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <p className="text-[8px] text-slate-500 uppercase mt-2 font-bold italic">A moeda muda automaticamente ao trocar o país.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-black/20 p-4 rounded-xl border border-border-custom flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Cálculo de IVA</p>
                <p className="text-[10px] text-slate-500 uppercase mt-0.5">Ativar IVA automático</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={isTaxEnabled}
                  onChange={(e) => setIsTaxEnabled(e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-blue"></div>
              </label>
            </div>

            <div className="bg-black/20 p-4 rounded-xl border border-border-custom">
              <label className="label-custom">Desconto Global (%)</label>
              <div className="relative">
                <input 
                  type="number"
                  className="input-custom pr-12"
                  placeholder="0"
                  value={discountRate}
                  onChange={(e) => setDiscountRate(Number(e.target.value))}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">%</span>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {isTaxEnabled && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div>
                  <label className="label-custom">Percentagem de IVA (%)</label>
                  <div className="relative">
                    <input 
                      type="number"
                      className="input-custom pr-12"
                      placeholder="Ex: 14"
                      value={taxRate}
                      onChange={(e) => setTaxRate(Number(e.target.value))}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">%</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Card: QR Configuration */}
        {isSoba && (
          <div className="card">
            <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border-custom">
              <Printer size={18} className="text-accent-gold" />
              <h2 className="text-sm font-bold text-accent-gold uppercase tracking-wider">Configuração do QR Code</h2>
            </div>
            <div className="grid grid-cols-2 gap-y-4">
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="qrApp" 
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-accent-gold focus:ring-accent-gold"
                  checked={qrConfig.includeApp} 
                  onChange={e => setQrConfig({...qrConfig, includeApp: e.target.checked})} 
                />
                <label htmlFor="qrApp" className="text-[11px] font-bold text-slate-400 uppercase">Tag App</label>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="qrDoc" 
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-accent-gold focus:ring-accent-gold"
                  checked={qrConfig.includeDocType} 
                  onChange={e => setQrConfig({...qrConfig, includeDocType: e.target.checked})} 
                />
                <label htmlFor="qrDoc" className="text-[11px] font-bold text-slate-400 uppercase">Tipo Doc</label>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="qrId" 
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-accent-gold focus:ring-accent-gold"
                  checked={qrConfig.includeId} 
                  onChange={e => setQrConfig({...qrConfig, includeId: e.target.checked})} 
                />
                <label htmlFor="qrId" className="text-[11px] font-bold text-slate-400 uppercase">ID Único</label>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="qrNif" 
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-accent-gold focus:ring-accent-gold"
                  checked={qrConfig.includeNif} 
                  onChange={e => setQrConfig({...qrConfig, includeNif: e.target.checked})} 
                />
                <label htmlFor="qrNif" className="text-[11px] font-bold text-slate-400 uppercase">NIF Empresa</label>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="qrCli" 
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-accent-gold focus:ring-accent-gold"
                  checked={qrConfig.includeClient} 
                  onChange={e => setQrConfig({...qrConfig, includeClient: e.target.checked})} 
                />
                <label htmlFor="qrCli" className="text-[11px] font-bold text-slate-400 uppercase">Nome Cliente</label>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="qrVal" 
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-accent-gold focus:ring-accent-gold"
                  checked={qrConfig.includeValue} 
                  onChange={e => setQrConfig({...qrConfig, includeValue: e.target.checked})} 
                />
                <label htmlFor="qrVal" className="text-[11px] font-bold text-slate-400 uppercase">Valor Total</label>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="qrDat" 
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-accent-gold focus:ring-accent-gold"
                  checked={qrConfig.includeDate} 
                  onChange={e => setQrConfig({...qrConfig, includeDate: e.target.checked})} 
                />
                <label htmlFor="qrDat" className="text-[11px] font-bold text-slate-400 uppercase">Data</label>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="qrWeb" 
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-accent-gold focus:ring-accent-gold"
                  checked={qrConfig.includeWeb} 
                  onChange={e => setQrConfig({...qrConfig, includeWeb: e.target.checked})} 
                />
                <label htmlFor="qrWeb" className="text-[11px] font-bold text-slate-400 uppercase">Link Portal</label>
              </div>
            </div>
            <p className="mt-4 text-[9px] text-slate-500 font-bold uppercase leading-tight">
              * Escolha as informações que deseja codificar no QR Code da fatura para facilitar o escaneamento por sistemas externos ou portais de verificação.
            </p>
          </div>
        )}

        {/* Card: Items */}
        <div className="card">
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border-custom">
            <ShoppingCart size={18} className="text-accent-blue" />
            <h2 className="text-sm font-bold text-accent-blue uppercase tracking-wider">Produtos / Serviços</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label-custom">Descrição do Item</label>
              <input 
                className="input-custom"
                placeholder="Ex: Consultoria Técnica"
                value={prodDesc}
                onChange={(e) => setProdDesc(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-custom">QTD</label>
                <input 
                  type="number"
                  className="input-custom"
                  placeholder="1"
                  value={prodQtd}
                  onChange={(e) => setProdQtd(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label-custom">Preço Unit. ({currency})</label>
                <input 
                  type="number"
                  className="input-custom"
                  placeholder="0,00"
                  value={prodPreco}
                  onChange={(e) => setProdPreco(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button 
                onClick={addItem}
                className="btn-primary"
                >
                <Plus size={18} /> Inserir Item
                </button>
                <button 
                onClick={() => setShowBatchModal(true)}
                className="btn-outline !text-[11px] !py-3"
                >
                <Download size={14} className="rotate-180" /> Gerar Várias (Lote)
                </button>
            </div>
          </div>

          {/* List Area */}
          <div className="mt-8 space-y-2">
            <AnimatePresence>
              {items.map((item, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="flex items-center justify-between p-3 bg-black/20 border border-border-custom rounded-lg text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-accent-blue font-bold tabular-nums">{item.qtd}x</span>
                    <span className="text-slate-300 truncate max-w-[150px] md:max-w-[250px]">{item.desc}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-slate-100 tabular-nums">{formatCurrency(item.total)}</span>
                    <button 
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      className="text-accent-red hover:bg-accent-red/10 p-1 rounded transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Total Display */}
          <div className="mt-8 pt-6 border-t border-dashed border-border-custom text-right space-y-1">
            {discountRate > 0 && (
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest leading-relaxed">
                Subtotal: {formatCurrency(subtotal)}<br/>
                Desconto ({discountRate}%): -{formatCurrency(discountAmount)}
              </p>
            )}
            {isTaxEnabled && (
              <div className="space-y-0.5 mb-2">
                {discountRate === 0 && <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Subtotal: {formatCurrency(subtotal)}</p>}
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">IVA ({taxRate}%): {formatCurrency(taxAmount)}</p>
              </div>
            )}
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Valor Total a Pagar</p>
            <p className="text-3xl font-black text-accent-gold tracking-tight">{formatCurrency(total)}</p>
          </div>

          <div className="mt-6 flex flex-wrap gap-4 items-center">
            <button 
                onClick={clearItems}
                className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest hover:text-accent-red transition-colors"
            >
                <Trash2 size={12} /> Limpar Lista
            </button>
            <button 
                onClick={exportCurrentItemsCSV}
                className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest hover:text-accent-blue transition-colors"
            >
                <Download size={12} /> Exportar Itens (CSV)
            </button>
          </div>

          {!isSoba && (
            <motion.div 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              className="mt-10 p-5 border border-white/5 bg-white/[0.02] rounded-2xl text-center relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-transparent via-accent-red/20 to-transparent" />
              <p className="text-[10px] text-accent-red font-black uppercase tracking-[0.2em] mb-2">Publicidade</p>
              <p className="text-sm font-bold text-slate-200 mb-1">Grupo 90 Creations</p>
              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                Criamos soluções digitais personalizadas para o seu negócio. 
                <br/>Softwares de Gestão, Mobile Apps e Websites Profissionais.
                <br/><span className="text-accent-blue mt-1 inline-block font-bold">WhatsApp: +244 943 355 704</span>
                <br/><span className="text-slate-400">Email: dias90kk@gmail.com</span>
              </p>
            </motion.div>
          )}
        </div>

      </div>

      {/* Monthly Sales Dashboard */}
      {history.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-10 mb-20 p-6 card border-accent-blue/30"
        >
          <div className="flex items-center gap-2 mb-6">
             <div className="w-2 h-6 bg-accent-blue rounded-full"></div>
             <h2 className="text-xl font-black text-slate-200 uppercase tracking-widest">Resumo de Vendas Mensais</h2>
          </div>
          <div className="h-[300px] w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySalesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" tickLine={false} axisLine={false} />
                <YAxis 
                  stroke="rgba(255,255,255,0.5)" 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} 
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: '#111827', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  itemStyle={{ color: '#0ea5e9', fontWeight: 'bold' }}
                  formatter={(value: number) => [`${formatCurrency(value)}`, 'Total']}
                />
                <Bar dataKey="Total" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {/* Floating Action Button */}
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="fixed bottom-6 left-0 right-0 px-4 md:px-0 flex justify-center gap-4 z-50 pointer-events-none"
      >
        <button 
          onClick={resetInvoice}
          className="btn-outline max-w-[150px] pointer-events-auto bg-slate-900/80 backdrop-blur-md rounded-xl"
        >
          <Trash2 size={18} /> ZERAR
        </button>
        <button 
          onClick={() => {
            if (items.length === 0) {
              alert('Adicione pelo menos um item à fatura.');
              return;
            }
            setShowPreview(true);
          }}
          className="btn-gold max-w-sm flex-1 pointer-events-auto !py-4 shadow-2xl !text-base"
        >
          <Eye size={20} /> PRÉ-VISUALIZAR & IMPRIMIR
        </button>
      </motion.div>

      {/* Login Modal */}
      <AnimatePresence>
        {showLogin && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
              onClick={() => setShowLogin(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-bg-card border border-accent-gold rounded-3xl p-8 w-full max-w-sm relative z-10 text-center shadow-2xl"
            >
              <Crown size={48} className="mx-auto text-accent-gold mb-4" />
              <h2 className="text-2xl font-black text-accent-gold mb-2">ACESSO SOBA 👑</h2>
              <p className="text-slate-400 text-sm mb-8">Desbloqueie ferramentas profissionais e personalização completa.</p>
              
              <input 
                type="password"
                className="input-custom text-center py-4 text-lg tracking-[0.5em] mb-6 border-accent-gold/30"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSobaLogin()}
              />

              <button onClick={handleSobaLogin} className="btn-gold mb-4">
                Entrar no Sistema
              </button>
              <button onClick={() => setShowLogin(false)} className="btn-outline">
                Continuar como Visitante
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHistory && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
              onClick={() => setShowHistory(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-bg-card border border-border-custom rounded-3xl p-6 w-full max-w-lg relative z-10 shadow-2xl flex flex-col max-h-[85vh]"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-black text-slate-200 uppercase tracking-widest">Histórico Local</h2>
                <button onClick={() => setShowHistory(false)} className="text-slate-500 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="text"
                  placeholder="Buscar por cliente ou número..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="input-custom pl-9"
                />
              </div>

              <div className="overflow-y-auto pr-2 space-y-3 custom-scrollbar flex-1">
                {history.length === 0 ? (
                  <div className="text-center py-10 opacity-30">
                    <FileText size={48} className="mx-auto mb-2" />
                    <p className="text-xs font-bold uppercase tracking-widest">Sem faturas salvas</p>
                  </div>
                ) : (
                  history
                    .filter(record => 
                      record.client.toLowerCase().includes(historySearch.toLowerCase()) || 
                      record.num.toLowerCase().includes(historySearch.toLowerCase())
                    )
                    .map((record) => {
                      const deadline = record.dueDate;
                      const stats = record.status || 'Pendente';
                      
                      let deadlineLabel = null;
                      let deadlineColor = "";
                      
                      if (deadline && stats === 'Pendente') {
                        const today = new Date();
                        const due = new Date(deadline);
                        const diffTime = due.getTime() - today.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        
                        if (diffDays < 0) {
                          deadlineLabel = "Vencida";
                          deadlineColor = "text-red-500 bg-red-500/10 border-red-500/20";
                        } else if (diffDays <= 3) {
                          deadlineLabel = `Vence em ${diffDays} dias`;
                          deadlineColor = "text-amber-500 bg-amber-500/10 border-amber-500/20";
                        }
                      }

                      return (
                      <div 
                        key={record.id}
                        className={`p-3 bg-black/20 border rounded-xl flex items-center justify-between group transition-all ${
                          deadlineLabel === 'Vencida' ? 'border-red-500/30 bg-red-500/5' : 'border-border-custom hover:border-accent-blue/50'
                        }`}
                      >
                        <div className="cursor-pointer flex-1" onClick={() => loadFromHistory(record)}>
                          <div className="flex items-center gap-2 mb-1">
                             <span className="text-[9px] font-black bg-accent-blue/10 text-accent-blue px-1.5 py-0.5 rounded">{record.type}</span>
                             <span className="text-[10px] text-slate-500 font-bold">{record.date.split('-').reverse().join('/')}</span>
                             
                             <div 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 const nextStatus = stats === 'Pago' ? 'Pendente' : 'Pago';
                                 updateInvoiceStatus(record.id, nextStatus as any);
                               }}
                               className={`text-[8px] font-black px-1.5 py-0.5 rounded border cursor-pointer hover:scale-105 transition-all ${
                               stats === 'Pago' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 
                               stats === 'Anulado' ? 'bg-red-500/10 text-red-500 border-red-500/30' : 
                               'bg-amber-500/10 text-amber-500 border-amber-500/30'
                             }`}>
                               {stats.toUpperCase()}
                             </div>

                             <div className="flex gap-1 ml-auto">
                               {deadlineLabel && (
                                 <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border animate-pulse ${deadlineColor}`}>
                                   {deadlineLabel.toUpperCase()}
                                 </span>
                               )}
                               {record.discountAmount && record.discountAmount > 0 && (
                                 <span className="bg-emerald-500/10 text-emerald-400 text-[8px] font-black px-1.5 py-0.5 rounded border border-emerald-500/30">DESC</span>
                               )}
                               {record.taxAmount && record.taxAmount > 0 && (
                                 <span className="bg-accent-blue/10 text-accent-blue text-[8px] font-black px-1.5 py-0.5 rounded border border-accent-blue/30">IVA</span>
                               )}
                             </div>
                          </div>
                          <p className="text-sm font-bold text-slate-200 truncate">{record.client}</p>
                          <div className="flex justify-between items-end mt-0.5">
                             <p className="text-xs font-black text-accent-gold">{formatKz(record.total)} Kz</p>
                             {deadline && (
                               <p className="text-[8px] text-slate-600 font-bold uppercase">Venc: {deadline.split('-').reverse().join('/')}</p>
                             )}
                          </div>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteHistory(record.id); }}
                          className="text-slate-600 hover:text-accent-red p-2"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      );
                    })
                )}
              </div>

              <div className="flex items-center gap-4 mt-6">
                <button 
                    onClick={() => { 
                      if(confirm('Limpar todo o histórico?')) { 
                        if (user) {
                          history.forEach(h => removeInvoiceFromFirebase(h.id));
                        } 
                        if (supabaseUser) {
                          history.forEach(h => deleteInvoiceFromSupabase(h.id));
                          setHistory([]);
                        }
                        if (!user && !supabaseUser) {
                          setHistory([]); 
                          localStorage.removeItem(HISTORY_KEY); 
                        }
                      } 
                    }}
                    className="text-[10px] text-slate-500 font-bold uppercase tracking-widest hover:text-accent-red"
                >
                    Limpar Tudo
                </button>
                <button 
                    onClick={exportHistoryCSV}
                    className="text-[10px] text-accent-blue font-bold uppercase tracking-widest ml-auto flex items-center gap-1.5"
                >
                    <Download size={12} /> Exportar CSV
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showCustomerManager && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
              onClick={() => setShowCustomerManager(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-bg-card border border-border-custom rounded-3xl p-6 w-full max-w-lg relative z-10 shadow-2xl flex flex-col max-h-[85vh]"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-accent-blue/10 rounded-xl flex items-center justify-center text-accent-blue">
                      <User size={20} />
                   </div>
                   <h2 className="text-lg font-black text-slate-200 uppercase tracking-widest">Catálogo de Clientes</h2>
                </div>
                <button onClick={() => setShowCustomerManager(false)} className="text-slate-500 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="text"
                  placeholder="Buscar cliente por nome ou NIF..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="input-custom pl-9"
                />
              </div>

              <div className="overflow-y-auto pr-2 space-y-3 custom-scrollbar flex-1">
                {customers.length === 0 ? (
                  <div className="text-center py-10 opacity-30">
                    <User size={48} className="mx-auto mb-2" />
                    <p className="text-xs font-bold uppercase tracking-widest">Nenhum cliente cadastrado</p>
                  </div>
                ) : (
                  customers
                    .filter(c => 
                      c.name.toLowerCase().includes(customerSearch.toLowerCase()) || 
                      (c.nif && c.nif.includes(customerSearch))
                    )
                    .map((customer) => (
                    <div 
                      key={customer.id}
                      className="p-4 bg-black/20 border border-border-custom rounded-xl flex items-center justify-between group hover:border-accent-blue/50 transition-colors"
                    >
                      <div className="cursor-pointer flex-1" onClick={() => {
                        setCliNome(customer.name);
                        setCliNif(customer.nif || '');
                        setCliEmail(customer.email || '');
                        setShowCustomerManager(false);
                      }}>
                        <p className="text-sm font-black text-slate-200 uppercase tracking-tight">{customer.name}</p>
                        <div className="flex gap-4 mt-1 opacity-60">
                           {customer.nif && <p className="text-[10px] font-bold uppercase tracking-widest">NIF: {customer.nif}</p>}
                           {customer.email && <p className="text-[10px] font-bold uppercase tracking-widest">Email: {customer.email}</p>}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 flex gap-3">
                 <div className="bg-accent-blue/5 border border-accent-blue/20 p-3 rounded-xl flex gap-3 items-center w-full">
                    <div className="bg-accent-blue/10 p-2 rounded-lg text-accent-blue">
                       <Crown size={18} />
                    </div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
                       Sincronização em tempo real ativa. Toque num cliente para carregar os seus dados na fatura atual.
                    </p>
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Batch Invoicing Modal */}
      <AnimatePresence>
        {showBatchModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
              onClick={() => setShowBatchModal(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-bg-card border border-accent-blue/30 rounded-3xl p-8 w-full max-w-sm relative z-10 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-black text-accent-blue uppercase tracking-widest">Faturação em Lote</h2>
                <button onClick={() => setShowBatchModal(false)} className="text-slate-500">
                  <X size={20} />
                </button>
              </div>

              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Cada nome em uma nova linha criará uma fatura individual com os itens atuais ({items.length} itens).
              </p>
              
              <textarea 
                className="input-custom min-h-[150px] py-4 text-sm font-mono resize-none"
                placeholder="Ex:&#10;João Silva&#10;Maria Santos&#10;Empresa XYZ"
                value={batchClients}
                onChange={(e) => setBatchClients(e.target.value)}
              />

              <button 
                onClick={generateBatch}
                className="btn-primary mt-6 !shadow-accent-blue/40"
              >
                Gerar {batchClients.split('\n').filter(n => n.trim() !== '').length} Faturas agora
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Preview Modal */}
      <AnimatePresence>
        {showPreview && (
          <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/95 backdrop-blur-md p-4 md:p-10 flex flex-col items-center">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <button 
                  onClick={() => setShowPreview(false)}
                  className="flex items-center gap-2 text-white/40 hover:text-white transition-colors"
                >
                  <X size={24} /> 
                  <span className="text-sm font-bold uppercase tracking-widest hidden md:inline">Fechar</span>
                </button>
                <h3 className="text-[#00c9ff] text-base md:text-xl font-black tracking-[0.3em] text-center flex-1 pr-6 uppercase">VERIFICAR DOCUMENTO</h3>
              </div>

              {/* Paper Visual */}
              <div 
                id="invoiceRef" 
                ref={invoiceRef} 
                className="bg-white text-black p-4 md:p-10 mb-10 rounded shadow-2xl relative min-h-[500px] overflow-hidden transition-all duration-300"
                style={{
                  '--thermal-pt': `${thermalConfig.pt}px`,
                  '--thermal-pb': `${thermalConfig.pb}px`,
                  '--thermal-px': `${thermalConfig.px}px`,
                  '--thermal-width': `${thermalConfig.width}mm`,
                } as React.CSSProperties}
              >
                
                {/* Control Panel (no-print) */}
                <div className="absolute top-2 right-2 z-50 no-print flex flex-col items-end gap-2">
                  <div className="flex gap-2">
                    <button 
                      onClick={copyInvoiceText}
                      className="p-2 bg-emerald-900/80 border border-emerald-700/80 rounded-full text-emerald-400 hover:text-white hover:bg-emerald-800 transition-colors shadow-lg"
                      title="Copiar Dados da Fatura"
                    >
                      <Copy size={18} />
                    </button>
                    <button 
                      onClick={() => setThermalSettingsOpen(!thermalSettingsOpen)}
                      className="p-2 bg-slate-900 border border-slate-700 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shadow-lg"
                      title="Ajuste Fino de Impressão Térmica"
                    >
                      <Settings size={18} className={thermalSettingsOpen ? 'animate-spin-slow' : ''} />
                    </button>
                  </div>

                  {thermalSettingsOpen && (
                    <div className="mt-2 w-64 bg-slate-900 border border-slate-700 text-slate-200 p-4 rounded-xl shadow-2xl text-left">
                       <h4 className="font-bold text-accent-blue uppercase text-[11px] mb-3 border-b border-slate-700 pb-2">Ajuste Margens (Térmica)</h4>
                       
                       <div className="space-y-3 text-[10px]">
                         <div>
                           <label className="flex justify-between text-slate-400 font-bold mb-1">
                             <span>Topo (pt)</span>
                             <span className="text-white">{thermalConfig.pt}px</span>
                           </label>
                           <input type="range" min="0" max="100" value={thermalConfig.pt} onChange={(e) => setThermalConfig({...thermalConfig, pt: parseInt(e.target.value)})} className="w-full accent-accent-blue" />
                         </div>
                         <div>
                           <label className="flex justify-between text-slate-400 font-bold mb-1">
                             <span>Fundo (pb)</span>
                             <span className="text-white">{thermalConfig.pb}px</span>
                           </label>
                           <input type="range" min="0" max="100" value={thermalConfig.pb} onChange={(e) => setThermalConfig({...thermalConfig, pb: parseInt(e.target.value)})} className="w-full accent-accent-blue" />
                         </div>
                         <div>
                           <label className="flex justify-between text-slate-400 font-bold mb-1">
                             <span>Laterais (px)</span>
                             <span className="text-white">{thermalConfig.px}px</span>
                           </label>
                           <input type="range" min="0" max="100" value={thermalConfig.px} onChange={(e) => setThermalConfig({...thermalConfig, px: parseInt(e.target.value)})} className="w-full accent-accent-blue" />
                         </div>
                         <div>
                           <label className="flex justify-between text-slate-400 font-bold mb-1">
                             <span>Largura do Papel</span>
                             <span className="text-white">{thermalConfig.width}mm</span>
                           </label>
                           <input type="range" min="50" max="120" value={thermalConfig.width} onChange={(e) => setThermalConfig({...thermalConfig, width: parseInt(e.target.value)})} className="w-full accent-accent-blue" />
                         </div>
                         <div>
                           <label className="flex justify-between text-slate-400 font-bold mb-1">
                             <span>Padding do QR Code</span>
                             <span className="text-white">{thermalConfig.qrPadding}px</span>
                           </label>
                           <input type="range" min="0" max="50" value={thermalConfig.qrPadding} onChange={(e) => setThermalConfig({...thermalConfig, qrPadding: parseInt(e.target.value)})} className="w-full accent-accent-blue" />
                         </div>
                       </div>
                    </div>
                  )}
                </div>

                <div className="bg-white text-black p-4 md:p-10 flex flex-col min-h-[600px] relative">
                  {/* Watermark */}
                  {wmCheck && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45 text-[40px] md:text-[80px] font-black text-black/[0.03] pointer-events-none select-none uppercase border-2 md:border-4 border-black/[0.03] px-5 md:px-10 py-2 md:py-4 whitespace-nowrap z-0">
                      {wmText}
                    </div>
                  )}

                  <div className="relative z-10 flex flex-col flex-grow">
                    {/* Header: Logo and QR */}
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex flex-col gap-4">
                        {company.logo ? (
                          <img src={company.logo} alt="Logo" className="w-16 h-16 md:w-20 md:h-20 object-contain" />
                        ) : (
                          <div className="w-20 h-20 bg-slate-100 flex items-center justify-center rounded-lg border border-dashed border-slate-300">
                            <ImageIcon size={32} className="text-slate-400" />
                          </div>
                        )}
                        
                        <div className="space-y-0.5">
                          <h1 className="text-xl md:text-2xl font-black text-black leading-tight uppercase tracking-tight">
                            {company.nome || 'GLOBAL SKILLS ACADEMY'}
                          </h1>
                          <p className="text-[10px] md:text-xs text-black font-bold uppercase">{company.sigla || 'GSA'}</p>
                          <p className="text-[10px] md:text-xs text-black">NIF: {company.nif || '36678888'}</p>
                          <div className="text-[10px] md:text-xs text-black leading-relaxed max-w-[200px]">
                            <p>{company.end || 'Distrito Urbano de Ingombotas.'}</p>
                            <p>{company.tel || '943355704'}</p>
                            <p>{company.cidade || 'Luanda'} - {company.pais || 'Angola'}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <div 
                          className="inline-block relative cursor-help no-print-cursor shrink-0 bg-white border border-slate-200 rounded-lg shadow-sm"
                          onClick={() => setShowQRDebug(!showQRDebug)}
                        >
                          <img src={getQRDataUrl(150)} className="w-16 md:w-24 block" alt="QR Code" />
                        </div>
                        <p className="text-base md:text-xl font-black text-accent-gold tracking-tight">{docNum}</p>
                      </div>
                    </div>

                    <div className="h-[2px] bg-black w-full mb-8"></div>

                    {/* Document Title */}
                    <h2 className="text-2xl md:text-4xl font-black text-black mb-8 uppercase tracking-tighter">
                      {docTipo === 'FR' ? 'FACTURA / RECIBO' : docTipo === 'FT' ? 'FACTURA' : 'VD / CONSULTA'}
                    </h2>

                    {/* Client & Date Section */}
                    <div className="flex justify-between mb-8">
                      <div className="space-y-1">
                        <p className="text-[11px] md:text-xs text-black font-bold uppercase">Cliente:</p>
                        <p className="text-lg md:text-2xl font-black text-black leading-none">{cliNome || 'Consumidor Final'}</p>
                        <p className="text-xs md:text-sm text-black font-medium">NIF: {cliNif || '---'}</p>
                        {cliEmail && <p className="text-xs md:text-sm text-black/60">{cliEmail}</p>}
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-[11px] md:text-xs text-black font-bold uppercase">Data:</p>
                        <p className="text-sm md:text-base font-bold text-black">{docData.split('-').reverse().join('/')}</p>
                      </div>
                    </div>

                    {/* Items Table */}
                    <div className="flex-grow mb-8 overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-[#f2f5f9] border-y border-black">
                          <tr>
                            <th className="px-4 py-3 text-[10px] md:text-xs font-black text-black uppercase tracking-widest">DESCRIÇÃO</th>
                            <th className="px-4 py-3 text-[10px] md:text-xs font-black text-black uppercase tracking-widest text-center">QTD</th>
                            <th className="px-4 py-3 text-[10px] md:text-xs font-black text-black uppercase tracking-widest text-right">P. UNIT</th>
                            <th className="px-4 py-3 text-[10px] md:text-xs font-black text-black uppercase tracking-widest text-right">TOTAL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {items.map((item, idx) => (
                            <tr key={idx}>
                              <td className="px-4 py-4 text-xs md:text-sm font-medium text-black leading-relaxed">{item.desc}</td>
                              <td className="px-4 py-4 text-xs md:text-sm font-bold text-black text-center">{item.qtd}</td>
                              <td className="px-4 py-4 text-xs md:text-sm font-medium text-black text-right">{formatKz(item.preco)}</td>
                              <td className="px-4 py-4 text-xs md:text-sm font-bold text-black text-right">{formatKz(item.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Totals Section matching model */}
                    <div className="text-right mb-12">
                      {discountAmount > 0 && (
                        <div className="mb-2">
                           <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">Subtotal: {formatCurrency(subtotal)}</p>
                           <p className="text-[10px] md:text-xs font-bold text-emerald-600 uppercase tracking-widest">Desconto ({discountRate}%): -{formatCurrency(discountAmount)}</p>
                        </div>
                      )}
                      
                      {taxAmount > 0 && (
                        <div className="mb-4">
                          {discountAmount === 0 && <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">Subtotal: {formatCurrency(subtotal)}</p>}
                          <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">IVA ({taxRate}%): {formatCurrency(taxAmount)}</p>
                        </div>
                      )}

                      <p className="text-2xl md:text-5xl font-black text-accent-gold tracking-tight uppercase">
                        TOTAL: {formatCurrency(total)}
                      </p>
                    </div>

                    {/* Custom Fields */}
                    {customFields.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 mb-8">
                        {customFields.map((field, idx) => field.key && field.value && (
                          <div key={idx} className="flex flex-col py-1">
                             <span className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5">{field.key}</span>
                             <span className="text-[10px] md:text-xs font-bold text-black">{field.value}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="mt-auto pt-10">
                      <div className="border-t border-dotted border-slate-300 w-full mb-4"></div>
                      <p className="text-center text-[10px] md:text-xs text-slate-400 font-medium">
                        Gerado pelo sistema 90 Faturas do Grupo 90 Creations.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

                {/* Action Buttons - Matching Model Structure */}
              <div className="flex flex-col gap-6 pb-20 max-w-2xl mx-auto w-full">
                <p className="text-center text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-slate-500">SELECIONE O FORMATO DE IMPRESSÃO:</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button 
                    onClick={() => generatePDF('a4', 'save')}
                    className="flex items-center justify-center gap-3 bg-[#00d1ff] hover:bg-[#00b8e6] text-black h-20 md:h-24 rounded-2xl transition-all shadow-lg active:scale-95"
                  >
                    <Download size={28} />
                    <span className="text-sm md:text-lg font-black uppercase tracking-wider">PDF (A4)</span>
                  </button>

                  <button 
                    onClick={() => generatePDF('termico', 'save')}
                    className="flex items-center justify-center gap-3 bg-[#111827] border border-slate-700 hover:bg-black text-white h-20 md:h-24 rounded-2xl transition-all shadow-lg active:scale-95"
                  >
                    <Printer size={28} />
                    <span className="text-sm md:text-lg font-black uppercase tracking-wider">TÉRMICO (TALÃO)</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <button 
                    onClick={() => generatePDF('a4', 'print')}
                    className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white h-12 rounded-xl transition-all border border-white/10 text-[10px] md:text-xs font-bold uppercase tracking-widest"
                  >
                    <Printer size={16} />
                    IMPRIMIR AGORA
                  </button>
                  <button 
                    onClick={exportToPNG}
                    className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white h-12 rounded-xl transition-all border border-white/10 text-[10px] md:text-xs font-bold uppercase tracking-widest"
                  >
                    <ImageIcon size={16} />
                    BAIXAR IMAGEM
                  </button>
                  <button 
                    onClick={shareOnWhatsApp}
                    className="flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 h-12 rounded-xl transition-all border border-emerald-500/30 text-[10px] md:text-xs font-bold uppercase tracking-widest col-span-2"
                  >
                    <Copy size={16} />
                    ENVIAR VIA WHATSAPP (RESUMO + LINK)
                  </button>
                </div>
                
                <button 
                  onClick={() => setShowPreview(false)}
                  className="w-full bg-[#ff3366] hover:bg-[#e62e5c] text-white h-16 md:h-20 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-rose-500/20 active:scale-95"
                >
                  <X size={24} strokeWidth={3} />
                  <span className="text-base md:text-xl font-black uppercase tracking-wider">VOLTAR E EDITAR</span>
                </button>
              </div>
                
                <div className="bg-accent-gold/10 p-4 rounded-xl border border-accent-gold/20 flex gap-3">
                  <AlertCircle size={20} className="text-accent-gold shrink-0 mt-0.5" />
                  <p className="text-[11px] text-accent-gold/80 leading-relaxed uppercase font-bold">
                    O formato PDF A4 é recomendado para envio por WhatsApp/Email. O formato Talão é otimizado para impressoras térmicas 58mm.
                  </p>
                </div>
                
                <div className="flex flex-col md:flex-row gap-3 mt-2">
                  <button onClick={() => setShowPremiumModal(true)} className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 p-4 rounded-xl font-bold uppercase tracking-wide text-[10px] md:text-xs flex items-center justify-center transition-all text-center gap-2">
                     <span className="text-sm">❤️</span> Ajuda-nos a ajudar, doe aqui!
                  </button>
                  {!isSoba && (
                  <button onClick={() => { setShowPreview(false); setShowPremiumModal(true); }} className="flex-1 bg-gradient-to-r from-accent-blue/20 to-blue-600/20 hover:from-accent-blue/40 hover:to-blue-600/40 text-accent-blue border border-accent-blue/30 p-4 rounded-xl font-bold uppercase tracking-wide text-[10px] md:text-xs flex items-center justify-center transition-all text-center gap-2">
                     <Crown size={18} /> Torne-se um utilizador Premium e desbloqueie funções com o modo SoBA
                  </button>
                  )}
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

        {/* Premium Modal */}
        {showPremiumModal && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 backdrop-blur-xl bg-black/80">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-black text-accent-gold tracking-tight italic uppercase">90 PREMIUM</h2>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.1em] mt-1">Soluções de Facturação Profissional</p>
                  </div>
                  <button onClick={() => {
                    setShowPremiumModal(false);
                    setDepositStatus('idle');
                  }} className="text-slate-500 hover:text-white">
                    <X size={24} />
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {depositStatus === 'idle' ? (
                    <motion.div 
                      key="idle"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <p className="text-sm font-medium text-slate-300 leading-relaxed">
                          Ao apoiar o <span className="text-white font-bold">90 Faturas</span>, você desbloqueia novos limites de emissão diária.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div 
                          onClick={() => setUserLevel('donor')}
                          className={`p-4 rounded-2xl border cursor-pointer transition-all ${userLevel === 'donor' ? 'bg-accent-blue/20 border-accent-blue' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                        >
                          <h4 className="text-xs font-black text-white uppercase mb-1">Doador</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">10 Faturas/Dia</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Sem Publicidade</p>
                        </div>
                        <div 
                          onClick={() => setUserLevel('soba')}
                          className={`p-4 rounded-2xl border cursor-pointer transition-all ${userLevel === 'soba' ? 'bg-accent-gold/20 border-accent-gold' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                        >
                          <h4 className="text-xs font-black text-accent-gold uppercase mb-1">Mestre Soba</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Ilimitado</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Todas Funções</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-gold">Dados para Depósito/Transferência:</p>
                        
                        <div className="space-y-3">
                          <div className="bg-black/40 p-4 rounded-xl border border-white/5 group hover:border-accent-gold/20 transition-all">
                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Banco BAI</p>
                            <p className="text-sm font-mono text-white tracking-widest break-all">AO06.0040.0000.9876.5432.1018.9</p>
                            <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">TITULAR: Grupo 90 Creations Lda</p>
                          </div>
                          
                          <div className="bg-black/40 p-4 rounded-xl border border-white/5 group hover:border-accent-gold/20 transition-all">
                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Banco BFA</p>
                            <p className="text-sm font-mono text-white tracking-widest break-all">AO06.0006.0000.1234.5678.9012.3</p>
                            <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">TITULAR: Grupo 90 Creations Lda</p>
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={() => setDepositStatus('processing')}
                        className="w-full bg-accent-gold hover:bg-yellow-500 text-black h-14 rounded-2xl flex items-center justify-center gap-3 font-black uppercase tracking-widest transition-all shadow-xl shadow-accent-gold/10 active:scale-95"
                      >
                        CONFIRMAR DEPÓSITO REALIZADO
                      </button>
                    </motion.div>
                  ) : depositStatus === 'processing' ? (
                    <motion.div 
                      key="processing"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="py-10 text-center"
                    >
                      <div className="w-16 h-16 border-4 border-accent-gold border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                      <h3 className="text-xl font-black text-white uppercase tracking-wider mb-2">Processando...</h3>
                      <p className="text-slate-400 text-sm px-6 leading-relaxed mb-8">
                        O seu comprovativo está a ser verificado pela nossa equipa financeira. Aguarde o código de ativação.
                      </p>
                      <div className="p-4 bg-accent-gold/5 rounded-2xl border border-accent-gold/20 text-accent-gold text-xs font-bold leading-relaxed">
                        ⚠️ Você receberá uma notificação via Email/WhatsApp assim que o acesso for liberado.
                      </div>
                      <button 
                        onClick={() => setShowPremiumModal(false)}
                        className="mt-8 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-[0.2em]"
                      >
                        FECHAR E VOLTAR
                      </button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
              
              <div className="bg-black/40 p-4 border-t border-white/5 text-center">
                 <p className="text-[8px] text-slate-600 font-black uppercase tracking-[0.2em]">SISTEMA DE SEGURANÇA GRUPO 90 - VERIFICAÇÃO AUTOMÁTICA ATIVA</p>
              </div>
            </motion.div>
          </div>
        )}
        {supabaseUser?.email === 'dias90kk@gmail.com' && (
          <div className="card border-accent-gold/40 bg-accent-gold/5 mt-10 shadow-2xl shadow-accent-gold/5">
             <div className="flex items-center gap-2 mb-6 p-4 bg-accent-gold/10 rounded-t-2xl">
                <Crown size={20} className="text-accent-gold" />
                <h2 className="text-sm font-black text-accent-gold uppercase tracking-[0.2em]">Painel do Administrador</h2>
             </div>
             
             <div className="px-6 pb-6 space-y-6">
                <div className="text-left">
                   <label className="label-custom !text-accent-gold opacity-80 mb-2 block">Anúncio da Tela Inicial (Informações Importantes)</label>
                   <div className="flex gap-2">
                     <input 
                        type="text"
                        className="input-custom border-accent-gold/20 focus:border-accent-gold flex-1"
                        placeholder="Ex: Novos termos de uso atualizados..."
                        value={adminAnnouncement}
                        onChange={(e) => setAdminAnnouncement(e.target.value)}
                     />
                     <button 
                        onClick={() => {
                          localStorage.setItem('f90_adminAnnouncement', adminAnnouncement);
                          alert('Anúncio atualizado com sucesso!');
                        }}
                        className="px-6 bg-accent-gold text-black rounded-xl font-black text-[10px] uppercase shadow-lg shadow-accent-gold/20 hover:scale-[1.02] transition-all"
                     >
                        Confirmar
                     </button>
                   </div>
                   <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">Esta mensagem aparecerá na tela de login para todos os usuários.</p>
                </div>
                
                <div className="pt-6 border-t border-accent-gold/10 grid grid-cols-2 gap-4">
                   <div className="bg-black/40 p-5 rounded-2xl border border-accent-gold/10 text-left">
                      <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Métricas Globais</p>
                      <p className="text-xl font-black text-white">{history.length} <span className="text-xs text-slate-400 font-bold">Faturas Locais</span></p>
                   </div>
                   <div className="bg-black/40 p-5 rounded-2xl border border-emerald-500/10 text-left">
                      <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Status do Servidor</p>
                      <p className="text-xl font-black text-emerald-400">ONLINE <span className="text-xs text-slate-400 font-bold">Supabase</span></p>
                   </div>
                </div>
             </div>
          </div>
        )}
          </motion.div>
        )}
      </AnimatePresence>

      {supabaseUser && (
        <footer className="mt-20 py-10 border-t border-white/5 w-full max-w-lg mx-auto text-center">
           <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em] mb-6">Grupo 90 Creations Limited</p>
           <div className="flex justify-center gap-6 text-slate-500 mb-8">
              <a href="https://facebook.com" target="_blank" rel="noreferrer" className="hover:text-accent-blue transition-all hover:scale-110"><Facebook size={20} /></a>
              <a href="https://instagram.com" target="_blank" rel="noreferrer" className="hover:text-pink-500 transition-all hover:scale-110"><Instagram size={20} /></a>
              <a href="https://youtube.com" target="_blank" rel="noreferrer" className="hover:text-red-500 transition-all hover:scale-110"><YoutubeIcon size={20} /></a>
              <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="hover:text-blue-500 transition-all hover:scale-110"><Linkedin size={20} /></a>
              <a href="https://wa.me/244900000000" target="_blank" rel="noreferrer" className="hover:text-emerald-500 transition-all hover:scale-110"><MessageCircle size={20} /></a>
           </div>
           <p className="text-[8px] text-slate-700 font-bold uppercase tracking-widest">A faturar o futuro de Angola desde 2024</p>
        </footer>
      )}

      <canvas ref={qrCanvasRef} style={{ display: 'none' }} />
    </div>
  );
}
