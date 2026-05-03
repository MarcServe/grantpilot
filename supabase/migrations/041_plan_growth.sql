-- Add GrantsCopilot Growth paid tier (Stripe product GrantCopilot Growth)
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'GROWTH';
