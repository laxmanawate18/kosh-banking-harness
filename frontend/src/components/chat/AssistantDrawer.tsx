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
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      opener.current = document.activeElement as HTMLElement | null;
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
      if (opener.current?.isConnected && opener.current !== document.body) {
        opener.current.focus({ preventScroll: true });
        opener.current = null;
      }
    }
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
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === 'Tab') {
      const d = dialogRef.current;
      if (!d) return;
      const focusables = Array.from(d.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  return <>
    <dialog ref={dialogRef} className="assistant-dialog" aria-label={t('Mitra, Kosh AI banker')}
      onCancel={() => setIsOpen(false)} onClose={() => setIsOpen(false)} onKeyDown={handleKeyDown}
      onClick={e => { if (e.target === e.currentTarget) setIsOpen(false); }}>
      <section className="ai-main-workspace assistant-workspace">
        <ChatHeader onClose={() => setIsOpen(false)} />
        <ChatMessageList messages={messages} onSuggestedQuery={sendMessage} onOpenWorkflow={openWorkflow} onStartWorkflow={startWorkflowById} onApplyProduct={handleApplyProduct} />
        <ChatComposer />
      </section>
      <InstantOnboardingModal key={selectedProduct?.id} isOpen={!!selectedProduct} onClose={() => setSelectedProduct(null)} product={selectedProduct} />
    </dialog>
  </>;
}
