import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import type { SalesAction } from '../../types/chat';
import { Stagger } from '../common/Animate';

interface SalesActionCardProps {
  salesAction: SalesAction;
  onQueryClick: (q: string) => void;
  onApplyProduct?: (productId: string) => void;
}

export const SalesActionCard: React.FC<SalesActionCardProps> = ({
  salesAction,
  onQueryClick,
  onApplyProduct,
}) => {
  const { isConnected, isStreaming } = useChat();
  const queries = salesAction.suggested_queries || [];
  const nextAction = salesAction.next_action;

  if (!queries.length && !nextAction?.label) {
    return null;
  }

  return (
    <div className="sac">
      {nextAction?.label && onApplyProduct && nextAction.product_id && (
        <div className="sac-next">
          <button
            onClick={() => onApplyProduct(nextAction.product_id!)}
            className="k-btn primary sm"
          >
            {nextAction.label} <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {queries.length > 0 && (
        <Stagger className="sac-queries">
          {queries.map((q, idx) => (
            <Stagger.Item
              as="button"
              type="button"
              key={idx}
              onClick={() => onQueryClick(q)}
              disabled={!isConnected || isStreaming}
              className="ai-prompt-chip ai-suggestion"
            >
              {q}
            </Stagger.Item>
          ))}
        </Stagger>
      )}
    </div>
  );
};

