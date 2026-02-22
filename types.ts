
export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  PHARMACY = 'PHARMACY',
  ADMIN = 'ADMIN'
}

export enum OrderStatus {
  PENDING = 'Pendente',
  PREPARING = 'Preparando',
  OUT_FOR_DELIVERY = 'Saiu para Entrega',
  READY_FOR_PICKUP = 'Pronto para Retirada',
  COMPLETED = 'Concluído',
  CANCELLED = 'Cancelado',
  REJECTED = 'Recusado'
}

export type PrescriptionStatus = 'ANALYZING' | 'UNDER_REVIEW' | 'WAITING_FOR_QUOTES' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED' | 'ILLEGIBLE';

export type CommissionStatus = 'PENDING' | 'WAITING_APPROVAL' | 'PARTIAL' | 'PAID';
export type SettlementCycle = 'MONTHLY' | 'WEEKLY';

export type ProductUnitType = 'Caixa' | 'Lâmina' | 'Frasco' | 'Unidade' | 'Tubo' | 'Saqueta';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string; 
  address?: string; 
  role: UserRole;
  pharmacyId?: string;
  status?: 'ACTIVE' | 'BLOCKED';
  createdAt?: string;
  pdpaConsent?: boolean;
}

export interface Pharmacy {
  id: string;
  name: string;
  nif?: string;
  address: string;
  rating: number;
  deliveryFee: number;
  minTime: string;
  isAvailable: boolean;
  deliveryActive: boolean;
  status: string;
  ownerEmail: string;
  commissionRate?: number;
  phone?: string;
  distance?: string;
  distanceKm?: number; 
  latitude?: number;
  longitude?: number;
  receives_low_conf_rx?: boolean; 
  review_score?: number;
  triage_count?: number; 
  logoUrl?: string;
  description?: string;
  openingHours?: string; 
  paymentMethods?: string[]; 
  instagram?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  pharmacyId: string;
  image: string;
  requiresPrescription: boolean;
  stock: number;
  category?: string; 
  globalProductId?: string;
  isPromotion?: boolean;
  discountPrice?: number;
  unitType?: ProductUnitType; // NOVO CAMPO: Unidade de Venda (Lâmina, Caixa, etc)
}

export interface CartItem extends Product {
  quantity: number;
}

export interface Order {
  id: string;
  customerId?: string; // ID do utente (profile) — usado para isolar pedidos por cliente
  customerName: string;
  customerPhone?: string;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  date: string;
  createdAt?: string;
  type: 'DELIVERY' | 'PICKUP';
  pharmacyId: string;
  address?: string;
  commissionAmount?: number;
  commissionStatus?: CommissionStatus;
  commissionPaidAmount?: number;
}

export interface PrescriptionRequest {
  id: string;
  customerId: string;
  imageUrl: string;
  date: string;
  status: PrescriptionStatus;
  targetPharmacies: string[]; 
  notes?: string;
  quotes?: PrescriptionQuote[]; 
  image_hash?: string;
  ai_metadata?: {
    confidence: number;
    extracted_text: string;
    is_validated: boolean;
    validated_by?: string; 
    suggested_items: { name: string, quantity: number }[];
  };
  triaged_at?: string;
  expires_at?: string;
}

export interface PrescriptionQuote {
  id: string;
  prescription_id: string;
  pharmacyId: string;
  pharmacyName: string;
  items: QuotedItem[];
  totalPrice: number;
  deliveryFee: number;
  status: 'RESPONDED' | 'REJECTED' | 'ACCEPTED';
  notes?: string;
  createdAt: string;
}

export interface QuotedItem {
  name: string;
  quantity: number;
  price: number;
  available: boolean;
  isMatched?: boolean;
  unitType?: string; 
  productId?: string; // CAMPO CRÍTICO: ID Real do produto para baixar stock
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  date: string;
  link?: string;
}

export interface CarouselSlide {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  buttonText: string;
  order: number;
}

export interface Partner {
  id: string;
  name: string;
  logoUrl: string;
  active: boolean;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface PharmacyFinancials {
  id: string;
  name: string;
  commissionRate: number;
  stats: {
    totalSales: number;
    platformFees: number;
    netEarnings: number;
    pendingClearance: number;
    paidFees: number;
    unpaidFees: number;
  };
}

export interface GlobalProduct {
  id: string;
  name: string;
  description: string;
  category: string;
  image: string;
  common: boolean;
  referencePrice: number;
}

export interface PharmacyInput {
  name: string;
  nif?: string;
  address: string;
  deliveryFee: number;
  minTime: string;
  rating: number;
  phone?: string;
  logoUrl?: string;
  description?: string;
  openingHours?: string;
  paymentMethods?: string[];
  instagram?: string;
}

export interface GeneratedReport {
  resumo: string;
  abstract: string;
  introducao: string;
  objetivos: string;
  caracterizacao: string;
  atividades: string;
  competencias: string;
  dificuldades: string;
  conclusao: string;
  referencias: string;
}

export interface QuizData {
  logoBase64?: string;
  anexosBase64?: string[];
  instituicao: string;
  departamento: string;
  curso: string;
  localEstagio: string;
  nomeCompleto: string;
  provincia: string;
  anoLectivo: string;
  nivel: string;
  supervisor: string;
}

export const PRODUCT_CATEGORIES = [
    "Alergias e Reações Alérgicas",
    "Antibióticos e Antimicrobianos",
    "Antimaláricos e Doenças Tropicais",
    "Antiparasitários e Vermífugos",
    "Dermatologia e Cuidados com a Pele",
    "Diabetes e Controlo da Glicemia",
    "Dor, Feve e Inflamação",
    "Gravidez e Fertilidade",
    "Gripe, Tosse e Constipações",
    "Higiene e Cuidados Pessoais",
    "Hormonas e Endocrinologia",
    "Material Médico e Hospitalar",
    "Oftalmologia (Olhos)",
    "Oncologia e Tratamentos Especiais",
    "Otorrinolaringologia (Ouvidos/Nariz)",
    "Pressão Arterial e Coração",
    "Primeiros Socorros e Emergência",
    "Produtos Naturais e Fitoterápicos",
    "Saúde Digestiva (Estômago e Intestinos)",
    "Saúde Feminina",
    "Saúde Infantil e Pediátrica",
    "Saúde Masculina",
    "Saúde Mental e Neurologia",
    "Saúde Respiratória",
    "Testes Rápidos e Diagnóstico",
    "Uso Veterinário",
    "Vacinas e Imunização",
    "Vitaminas, Minerais e Suplementos",
    "Outros / Uso Especial"
];

export const UNIT_TYPES: ProductUnitType[] = ['Caixa', 'Lâmina', 'Frasco', 'Unidade', 'Tubo', 'Saqueta'];
