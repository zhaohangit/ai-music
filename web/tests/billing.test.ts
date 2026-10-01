import { describe, expect, it } from 'vitest';
import { billingPresentation } from '../src/lib/billing';

describe('ModelCross Track billing projection', () => {
  it('shows settled credits from ModelCross after capture', () => {
    expect(billingPresentation({
      billingStatus: 'captured', estimatedCredits: 20, settledCredits: 10,
    })).toMatchObject({ label: '已结算 10 积分', tone: 'success', final: true });
  });

  it('does not claim provider-direct work is free when ModelCross settlement is disabled', () => {
    expect(billingPresentation({ billingStatus: 'disabled', estimatedCredits: 20 })).toEqual({
      label: '未通过 ModelCross 结算',
      detail: '本地直连可能产生 API 账户费用，请以对应账户用量记录为准',
      tone: 'neutral',
      final: true,
    });
  });

  it('distinguishes release, refund, and reconciliation states', () => {
    expect(billingPresentation({ billingStatus: 'released', estimatedCredits: 20 }).label).toBe('积分已释放');
    expect(billingPresentation({ billingStatus: 'refunded', estimatedCredits: 20 }).label).toBe('积分已退回');
    expect(billingPresentation({ billingStatus: 'reconcile_required', estimatedCredits: 20 })).toMatchObject({
      label: '账单待对账', tone: 'danger', final: false,
    });
  });

  it('treats a partially captured batch as a terminal settlement', () => {
    expect(billingPresentation({
      billingStatus: 'partially_captured', estimatedCredits: 20, settledCredits: 10,
    })).toEqual({
      label: '部分成功，已结算 10 积分',
      detail: 'ModelCross 已按成功生成的结果完成结算，其余预留已释放',
      tone: 'warning',
      final: true,
    });
  });

  it('never accepts Provider merchant point fields as billing inputs', () => {
    const providerOnly = { pointsCost: 999, pointsRefunded: true };
    expect(billingPresentation(providerOnly)).toMatchObject({ label: '账单同步中', tone: 'neutral' });
  });
});
