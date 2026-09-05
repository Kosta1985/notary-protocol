-- Database-level guardrails for simulated wallet settlement.
-- These close race windows between application policy checks and the atomic D1 batch.

CREATE TRIGGER IF NOT EXISTS trg_payment_confirmed_wallet_active
BEFORE INSERT ON agent_payment_intents
WHEN NEW.status = 'CONFIRMED'
 AND COALESCE((SELECT status FROM agent_wallets WHERE id = NEW.sender_wallet_id), 'MISSING') <> 'ACTIVE'
BEGIN
  SELECT RAISE(ABORT, 'sender_wallet_not_active');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_confirmed_balance_available
BEFORE INSERT ON agent_payment_intents
WHEN NEW.status = 'CONFIRMED'
 AND COALESCE((SELECT available_atomic FROM wallet_balances WHERE wallet_id = NEW.sender_wallet_id AND asset = NEW.asset), -1) < NEW.amount_atomic
BEGIN
  SELECT RAISE(ABORT, 'insufficient_wallet_balance');
END;

CREATE TRIGGER IF NOT EXISTS trg_wallet_balance_nonnegative_update
BEFORE UPDATE OF available_atomic, reserved_atomic ON wallet_balances
WHEN NEW.available_atomic < 0 OR NEW.reserved_atomic < 0
BEGIN
  SELECT RAISE(ABORT, 'negative_wallet_balance');
END;
