-- Add GrantsCopilot Starter paid tier (Stripe product GrantCopilot Starter)
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'STARTER';
