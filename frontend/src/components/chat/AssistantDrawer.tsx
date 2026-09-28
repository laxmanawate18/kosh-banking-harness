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
      <InstantOnboardingModal isOpen={!!selectedProduct} onClose={() => setSelectedProduct(null)} product={selectedProduct} />
    </dialog>
  </>;
}
