-- Guardian approval/denial transition guardrails.
-- Approval is authorization only; it never creates credit or bypasses funded balance.

CREATE TRIGGER IF NOT EXISTS trg_payment_confirmed_update_wallet_active
BEFORE UPDATE OF status ON agent_payment_intents
WHEN NEW.status = 'CONFIRMED'
 AND OLD.status <> 'CONFIRMED'
 AND COALESCE((SELECT status FROM agent_wallets WHERE id = NEW.sender_wallet_id), 'MISSING') <> 'ACTIVE'
BEGIN
  SELECT RAISE(ABORT, 'sender_wallet_not_active');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_confirmed_update_recipient_active
BEFORE UPDATE OF status ON agent_payment_intents
WHEN NEW.status = 'CONFIRMED'
 AND OLD.status <> 'CONFIRMED'
 AND COALESCE((SELECT status FROM agent_wallets WHERE id = NEW.recipient_wallet_id), 'MISSING') <> 'ACTIVE'
BEGIN
  SELECT RAISE(ABORT, 'recipient_wallet_not_active');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_confirmed_update_balance_available
BEFORE UPDATE OF status ON agent_payment_intents
WHEN NEW.status = 'CONFIRMED'
 AND OLD.status <> 'CONFIRMED'
 AND COALESCE((SELECT available_atomic FROM wallet_balances WHERE wallet_id = NEW.sender_wallet_id AND asset = NEW.asset), -1) < NEW.amount_atomic
BEGIN
  SELECT RAISE(ABORT, 'insufficient_wallet_balance');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_confirmed_insert_recipient_active
BEFORE INSERT ON agent_payment_intents
WHEN NEW.status = 'CONFIRMED'
 AND COALESCE((SELECT status FROM agent_wallets WHERE id = NEW.recipient_wallet_id), 'MISSING') <> 'ACTIVE'
BEGIN
  SELECT RAISE(ABORT, 'recipient_wallet_not_active');
END;

CREATE TRIGGER IF NOT EXISTS trg_financial_transaction_requires_confirmed_intent
BEFORE INSERT ON agent_financial_transactions
WHEN COALESCE((SELECT status FROM agent_payment_intents WHERE id = NEW.payment_intent_id), 'MISSING') <> 'CONFIRMED'
BEGIN
  SELECT RAISE(ABORT, 'payment_intent_not_confirmed');
END;

CREATE TRIGGER IF NOT EXISTS trg_guardian_denial_audit_requires_blocked_intent
BEFORE INSERT ON wallet_audit_log
WHEN NEW.action = 'GUARDIAN_PAYMENT_DENIED'
 AND COALESCE((SELECT status FROM agent_payment_intents WHERE id = NEW.related_id), 'MISSING') <> 'BLOCKED'
BEGIN
  SELECT RAISE(ABORT, 'guardian_denial_state_conflict');
END;
