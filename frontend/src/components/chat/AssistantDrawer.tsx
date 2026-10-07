import { useEffect, useRef, useState } from 'react';
import { useChat } from '../../context/ChatContext';
import { useBanking } from '../../context/BankingContext';
import { ChatMessageList } from './ChatMessageList';
import { ChatComposer } from './ChatComposer';
import { ChatHeader } from './ChatHeader';
import { InstantOnboardingModal } from '../auth/InstantOnboardingModal';
import type { Product } from '../../types/products';
import { useI18n } from '../../i18n';

export function AssistantDrawer() {
  const { t } = useI18n();
  const { isOpen, setIsOpen, messages, sendMessage } = useChat();
  const { openWorkflow, startWorkflowById, activeWorkflowId, activeChallenge } = useBanking();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);
  useEffect(() => {
    if (activeWorkflowId || activeChallenge) setIsOpen(false);
  }, [activeWorkflowId, activeChallenge, setIsOpen]);
  const autoOpened = useRef(new Set<string>());
  useEffect(() => {
    // Mitra opened the secure application form for this product: show it once.
    const next = messages[messages.length - 1]?.salesAction?.next_action;
    if (!next?.auto_open || next.type !== 'OPEN_APPLICATION' || autoOpened.current.has(next.product_id)) return;
    const product = messages.flatMap(m => m.salesAction?.products || []).find(p => p.id === next.product_id);
    if (product) {
      autoOpened.current.add(next.product_id);
      setSelectedProduct(product as Product);
    }
  }, [messages]);
  useEffect(() => {
    const handleOpenLogin = () => setIsOpen(false);
    window.addEventListener('open-login-modal', handleOpenLogin);
    return () => window.removeEventListener('open-login-modal', handleOpenLogin);
  }, [setIsOpen]);
  const handleApplyProduct = (productId: string) => {
    const product = messages.flatMap(message => message.salesAction?.products || [])
      .find(item => item.id === productId);
    if (product) setSelectedProduct(product as Product);
  };
  return <>
    <dialog ref={dialogRef} className="assistant-dialog" aria-label={t('Mitra, Kosh AI banker')} onCancel={() => setIsOpen(false)} onClose={() => setIsOpen(false)} onClick={e => { if (e.target === e.currentTarget) setIsOpen(false); }}>
      <section className="ai-main-workspace assistant-workspace">
        <ChatHeader onClose={() => setIsOpen(false)} />
        <ChatMessageList messages={messages} onSuggestedQuery={sendMessage} onOpenWorkflow={openWorkflow} onStartWorkflow={startWorkflowById} onApplyProduct={handleApplyProduct} />
        <ChatComposer />
      </section>
      <InstantOnboardingModal key={selectedProduct?.id} isOpen={!!selectedProduct} onClose={() => setSelectedProduct(null)} product={selectedProduct} />
    </dialog>
  </>;
}
