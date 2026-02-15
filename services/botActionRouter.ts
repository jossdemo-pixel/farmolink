import { Product } from '../types';
import { BotActionEvent } from './geminiService';

type BotNavigatePage =
  | 'upload-rx'
  | 'prescriptions'
  | 'pharmacies-list'
  | 'cart'
  | 'support'
  | 'pharmacy-detail'
  | 'home';

export interface BotActionRouterContext {
  navigate: (page: BotNavigatePage | string) => void;
  addToCart: (product: Product) => void;
  setActivePharmacyId: (id: string | null) => void;
  products: Product[];
  notify?: (message: string) => void;
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const findProduct = (action: BotActionEvent, products: Product[]): Product | null => {
  const payload = (action.payload || {}) as Record<string, unknown>;
  const id = typeof payload.productId === 'string' ? payload.productId : '';
  const name = typeof payload.productName === 'string' ? payload.productName : '';

  if (id) {
    const direct = products.find((p) => p.id === id);
    if (direct) return direct;
  }

  if (!name) return null;
  const normalizedName = normalize(name);

  return (
    products.find((p) => normalize(p.name) === normalizedName) ||
    products.find((p) => normalize(p.name).includes(normalizedName)) ||
    null
  );
};

export const executeBotAction = (action: BotActionEvent, ctx: BotActionRouterContext): boolean => {
  const type = (action.type || '').toUpperCase();

  if (type === 'OPEN_UPLOAD_RX') {
    ctx.navigate('upload-rx');
    return true;
  }

  if (type === 'OPEN_PRESCRIPTIONS') {
    ctx.navigate('prescriptions');
    return true;
  }

  if (type === 'OPEN_PHARMACIES_NEARBY') {
    ctx.navigate('pharmacies-list');
    return true;
  }

  if (type === 'OPEN_SUPPORT' || type === 'ESCALATE_PHARMACY' || type === 'ESCALATE_ADMIN') {
    ctx.navigate('support');
    if (type === 'ESCALATE_PHARMACY') ctx.notify?.('Conversa encaminhada para farmácia.');
    if (type === 'ESCALATE_ADMIN') ctx.notify?.('Conversa encaminhada para administração.');
    return true;
  }

  if (type === 'OPEN_CART') {
    ctx.navigate('cart');
    return true;
  }

  if (type === 'OPEN_PHARMACY_DETAIL') {
    const pharmacyId = String((action.payload as any)?.pharmacyId || '');
    if (!pharmacyId) return false;
    ctx.setActivePharmacyId(pharmacyId);
    ctx.navigate('pharmacy-detail');
    return true;
  }

  if (type === 'ADD_TO_CART') {
    const product = findProduct(action, ctx.products);
    if (!product) {
      ctx.notify?.('Nao encontrei esse produto agora. Pode procurar na lista.');
      return false;
    }
    ctx.addToCart(product);
    ctx.navigate('cart');
    return true;
  }

  return false;
};
