import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import type { SalesAction } from '../../types/chat';

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
            className="button primary"
            style={{ fontSize: '13px', padding: '6px 14px' }}
          >
            {nextAction.label} <ArrowRight size={12} />
          </button>
        </div>
      )}

      {queries.length > 0 && (
        <div className="sac-queries">
          {queries.map((q, idx) => (
            <button
              key={idx}
              onClick={() => onQueryClick(q)}
              disabled={!isConnected || isStreaming}
              className="ai-prompt-chip ai-suggestion"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

